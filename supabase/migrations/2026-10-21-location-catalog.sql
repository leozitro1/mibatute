begin;

create or replace function public.location_name_key(p_name text)
returns text language sql immutable strict set search_path='' as $$
  select translate(lower(regexp_replace(btrim(p_name),'\s+',' ','g')),'áéíóúü','aeiouu');
$$;
revoke all on function public.location_name_key(text) from public,anon,authenticated;

create table if not exists public.market_cities (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80 and name !~ '[[:cntrl:]]'),
  active boolean not null default false,
  position integer not null default 1000,
  created_at timestamptz not null default now()
);
create unique index if not exists market_cities_name_key on public.market_cities(public.location_name_key(name));
create table if not exists public.market_localities (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.market_cities(id),
  name text not null check (char_length(name) between 2 and 80 and name !~ '[[:cntrl:]]'),
  position integer not null default 1000,
  created_at timestamptz not null default now()
);
create unique index if not exists market_localities_name_key on public.market_localities(city_id,public.location_name_key(name));
alter table public.market_cities enable row level security;
alter table public.market_localities enable row level security;
revoke all on public.market_cities,public.market_localities from public,anon,authenticated;
grant all on public.market_cities,public.market_localities to service_role;

-- Preserve exact existing names and activation. Rerunning never reverts staff changes.
do $seed$
declare item jsonb; zone text; city_id uuid; city_order integer:=0; zone_order integer;
begin
  for item in select value from jsonb_array_elements('[{"city": "Bogotá", "localities": ["Usaquén", "Chapinero", "Santa Fe", "San Cristóbal", "Usme", "Tunjuelito", "Bosa", "Kennedy", "Fontibón", "Engativá", "Suba", "Barrios Unidos", "Teusaquillo", "Los Mártires", "Antonio Nariño", "Puente Aranda", "La Candelaria", "Rafael Uribe Uribe", "Ciudad Bolívar", "Sumapaz"], "active": true}, {"city": "Medellín", "localities": ["El Poblado", "Laureles", "Belén", "Guayabal", "Aranjuez", "Robledo"], "active": false}, {"city": "Cali", "localities": ["Comuna 1", "Comuna 2", "Comuna 17", "Comuna 22"], "active": false}, {"city": "Barranquilla", "localities": ["Norte-Centro Histórico", "Riomar", "Sur Occidente", "Sur Oriente"], "active": false}]'::jsonb) loop
    insert into public.market_cities(name,active,position) values(item->>'city',(item->>'active')::boolean,city_order)
      on conflict do nothing;
    select id into city_id from public.market_cities where public.location_name_key(name)=public.location_name_key(item->>'city');
    zone_order:=0;
    for zone in select jsonb_array_elements_text(item->'localities') loop
      insert into public.market_localities(city_id,name,position) values(city_id,zone,zone_order) on conflict do nothing;
      zone_order:=zone_order+1;
    end loop;
    city_order:=city_order+1;
  end loop;
end;
$seed$;

create or replace function public.market_location_catalog()
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('city',c.name,'localities',c.localities,'active',c.active) order by c.position,c.name),'[]'::jsonb)
  from (select c.name,c.position,c.active,(select jsonb_agg(l.name order by l.position,l.name) from public.market_localities l where l.city_id=c.id) localities
    from public.market_cities c) c where c.localities is not null;
$$;
revoke all on function public.market_location_catalog() from public,anon,authenticated;
grant execute on function public.market_location_catalog() to anon,authenticated;

create or replace function public.staff_location_catalog()
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform public.staff_require('team');
  return (select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'city',c.name,'active',c.active,
    'localities',coalesce((select jsonb_agg(l.name order by l.position,l.name) from public.market_localities l where l.city_id=c.id),'[]'::jsonb))
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
      if not exists(select 1 from public.market_localities where city_id=city.id) then raise exception 'Añade al menos una localidad antes de activar la ciudad.'; end if;
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
revoke all on function public.staff_location_catalog(),public.staff_location_save(text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.staff_location_catalog(),public.staff_location_save(text,uuid,text,text) to authenticated;

-- Preserve existing listings when a city is paused, but enforce availability for new listings/moves.
create or replace function public.guard_article_location()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if TG_OP='UPDATE' and new.city is not distinct from old.city and new.locality is not distinct from old.locality then return new; end if;
  perform c.id from public.market_cities c join public.market_localities l on l.city_id=c.id
    where c.active and c.name=new.city and l.name=new.locality for share of c;
  if not found then raise exception 'Selecciona una ciudad activa y una localidad válida para publicar.'; end if;
  return new;
end;
$$;
revoke all on function public.guard_article_location() from public,anon,authenticated;
drop trigger if exists guard_article_location on public.articulos;
create trigger guard_article_location before insert or update of city,locality on public.articulos
  for each row execute function public.guard_article_location();
notify pgrst,'reload schema';
commit;
