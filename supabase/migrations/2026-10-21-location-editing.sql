begin;
alter table public.market_localities add column if not exists active boolean not null default true;

create or replace function public.market_location_catalog()
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('city',c.name,'active',c.active,
    'localities',coalesce((select jsonb_agg(l.name order by l.position,l.name) from public.market_localities l where l.city_id=c.id and l.active),'[]'::jsonb),
    'all_localities',coalesce((select jsonb_agg(l.name order by l.position,l.name) from public.market_localities l where l.city_id=c.id),'[]'::jsonb))
    order by c.position,c.name),'[]'::jsonb) from public.market_cities c;
$$;

create or replace function public.staff_location_catalog()
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform public.staff_require('team');
  return (select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'city',c.name,'active',c.active,
    'localities',coalesce((select jsonb_agg(l.name order by l.position,l.name) from public.market_localities l where l.city_id=c.id and l.active),'[]'::jsonb),
    'locality_details',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'name',l.name,'active',l.active) order by l.position,l.name) from public.market_localities l where l.city_id=c.id),'[]'::jsonb))
    order by c.position,c.name),'[]'::jsonb) from public.market_cities c);
end;
$$;

create or replace function public.staff_location_save(p_action text,p_city_id uuid default null,p_name text default null,p_locality text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare clean_name text:=regexp_replace(btrim(p_name),'\s+',' ','g');
  clean_locality text:=regexp_replace(btrim(p_locality),'\s+',' ','g');
  target uuid; city public.market_cities%rowtype;
begin
  -- team is master-only in staff_permission; this verifies MFA and the live staff session.
  perform public.staff_require('team');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('mibatute:location-catalog'));
  if p_action not in ('add_city','add_locality','activate_city','deactivate_city') or p_action is null then raise exception 'Acción no válida.'; end if;
  if p_action in ('add_city','add_locality') and (clean_name is null or char_length(clean_name) not between 2 and 80 or p_name ~ '[[:cntrl:]]') then
    raise exception 'Escribe un nombre de 2 a 80 caracteres, sin saltos de línea.';
  end if;
  if p_action='add_city' then
    if clean_locality is null or char_length(clean_locality) not between 2 and 80 or p_locality ~ '[[:cntrl:]]' then
      raise exception 'Añade una primera localidad de 2 a 80 caracteres.';
    end if;
    insert into public.market_cities(name,active) values(clean_name,true) returning id into target;
    insert into public.market_localities(city_id,name) values(target,clean_locality);
  else
    select * into city from public.market_cities where id=p_city_id for update;
    if not found then raise exception 'Selecciona una ciudad válida.'; end if;
    target:=city.id;
    if p_action='add_locality' then
      insert into public.market_localities(city_id,name) values(city.id,clean_name);
    elsif p_action='deactivate_city' then
      if not city.active then return public.staff_location_catalog(); end if;
      if (select count(*) from public.market_cities where active)<=1 then raise exception 'Debe quedar al menos una ciudad activa.'; end if;
      update public.market_cities set active=false where id=city.id;
    else
      if city.active then return public.staff_location_catalog(); end if;
      if not exists(select 1 from public.market_localities where city_id=city.id and active) then raise exception 'Añade al menos una localidad antes de activar la ciudad.'; end if;
      update public.market_cities set active=true where id=city.id;
    end if;
  end if;
  insert into public.staff_audit(actor_id,action,target_id,reason,changes)
    values(auth.uid(),'locations.'||p_action,target,
      case p_action when 'add_city' then 'Ciudad y primera localidad añadidas' when 'add_locality' then 'Localidad añadida' when 'deactivate_city' then 'Ciudad desactivada' else 'Ciudad activada' end,
      jsonb_build_object('city',coalesce(city.name,clean_name),'locality',case when p_action='add_city' then clean_locality when p_action='add_locality' then clean_name end));
  return public.staff_location_catalog();
exception when unique_violation then
  raise exception 'Ya existe una ciudad o localidad con ese nombre (incluyendo variaciones de mayúsculas y tildes).';
end;
$$;

-- Rename only unused labels. Historic articles, profiles, analytics and targeting retain their original labels.
create or replace function public.staff_location_edit(p_city_id uuid,p_action text,p_locality_id uuid default null,p_name text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare city public.market_cities%rowtype; zone public.market_localities%rowtype;
  clean_name text:=regexp_replace(btrim(p_name),'\s+',' ','g'); old_name text; target uuid; used boolean;
begin
  perform public.staff_require('team');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('mibatute:location-catalog'));
  if p_action is null or p_action not in ('rename_city','rename_locality','remove_locality','restore_locality') then raise exception 'Acción no válida.'; end if;
  select * into city from public.market_cities where id=p_city_id for update;
  if not found then raise exception 'Selecciona una ciudad válida.'; end if;
  if p_action in ('rename_city','rename_locality') and (clean_name is null or char_length(clean_name) not between 2 and 80 or p_name ~ '[[:cntrl:]]') then
    raise exception 'Escribe un nombre de 2 a 80 caracteres, sin saltos de línea.';
  end if;
  if p_action='rename_city' then
    old_name:=city.name;target:=city.id;
    if clean_name=old_name then return public.staff_location_catalog(); end if;
    if city.active then raise exception 'Desactiva la ciudad antes de cambiar su nombre.'; end if;
  else
    select * into zone from public.market_localities where id=p_locality_id and city_id=city.id for update;
    if not found then raise exception 'Selecciona una localidad de esta ciudad.'; end if;
    old_name:=zone.name;target:=zone.id;
    if p_action='rename_locality' and clean_name=old_name then return public.staff_location_catalog(); end if;
    if p_action='remove_locality' then
      if not zone.active then return public.staff_location_catalog(); end if;
      if city.active and (select count(*) from public.market_localities where city_id=city.id and active)<=1 then
        raise exception 'Debe quedar una localidad disponible en una ciudad activa. Desactiva la ciudad antes de retirar la última.';
      end if;
      update public.market_localities set active=false where id=zone.id;
    elsif p_action='restore_locality' then
      if zone.active then return public.staff_location_catalog(); end if;
      update public.market_localities set active=true where id=zone.id;
    end if;
  end if;
  if p_action in ('rename_city','rename_locality') then
    select exists(select 1 from public.articulos a where a.city=city.name and (p_action='rename_city' or a.locality=zone.name))
      or exists(select 1 from public.usuarios where ciudad=city.name and (p_action='rename_city' or localidad=zone.name))
      or exists(select 1 from public.staff_publication_history h where h.city=city.name and (p_action='rename_city' or h.locality=zone.name))
      or exists(select 1 from public.market_daily_metrics m where m.city=city.name and (p_action='rename_city' or m.locality=zone.name))
      or exists(select 1 from public.patrocinadores s cross join lateral jsonb_array_elements(s.target_locations) z
        where z->>'city'=city.name and (p_action='rename_city' or z->>'locality'=zone.name)) into used;
    if used then raise exception 'Este nombre ya tiene historial o está en uso. Consérvalo; puedes retirar la localidad y añadir otra sin alterar los datos existentes.'; end if;
    if p_action='rename_city' then update public.market_cities set name=clean_name where id=city.id;
    else update public.market_localities set name=clean_name where id=zone.id; end if;
  end if;
  insert into public.staff_audit(actor_id,action,target_id,reason,changes) values(auth.uid(),'locations.'||p_action,target,
    case p_action when 'rename_city' then 'Nombre de ciudad corregido' when 'rename_locality' then 'Nombre de localidad corregido' when 'remove_locality' then 'Localidad retirada de los selectores' else 'Localidad recuperada en los selectores' end,
    jsonb_build_object('city',city.name,'before',old_name,'after',case when p_action in ('rename_city','rename_locality') then clean_name else old_name end,'active',case p_action when 'remove_locality' then false when 'restore_locality' then true else null end));
  return public.staff_location_catalog();
exception when unique_violation then raise exception 'Ya existe una ciudad o localidad con ese nombre, incluso si está retirada.';
end;
$$;

create or replace function public.guard_article_location()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if TG_OP='UPDATE' and new.city is not distinct from old.city and new.locality is not distinct from old.locality then return new; end if;
  perform c.id from public.market_cities c join public.market_localities l on l.city_id=c.id
    where c.active and l.active and c.name=new.city and l.name=new.locality for share of c;
  if not found then raise exception 'Selecciona una ciudad activa y una localidad disponible para publicar.'; end if;
  return new;
end;
$$;
revoke all on function public.staff_location_edit(uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.staff_location_edit(uuid,text,uuid,text) to authenticated;
notify pgrst,'reload schema';
commit;
