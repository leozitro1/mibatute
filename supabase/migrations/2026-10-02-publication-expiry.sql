begin;

-- Expiry is derived from creation time; existing reservations can still finish.
create or replace function public.guard_publication_expiry()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  new_state text := lower(coalesce(nullif(new.estado, ''), new.status, 'disponible'));
  old_state text;
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then new.created_at := now(); end if;
    return new;
  end if;
  if new.created_at is distinct from old.created_at then
    raise exception 'La fecha de creacion de una publicacion no puede cambiar.';
  end if;
  old_state := lower(coalesce(nullif(old.estado, ''), old.status, 'disponible'));
  if old.created_at <= now() - interval '1440 hours' then
    if (new_state in ('reservado', 'reserved') and old_state not in ('reservado', 'reserved'))
      or (new_state in ('disponible', 'available') and old_state not in ('disponible', 'available', 'reservado', 'reserved'))
      or (new.is_featured and not coalesce(old.is_featured, false)) then
      raise exception 'Esta publicacion vencio despues de 60 dias. Crea una nueva publicacion.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_publication_expiry() from public, anon, authenticated;
drop trigger if exists publication_expiry on public.articulos;
create trigger publication_expiry before insert or update on public.articulos
for each row execute function public.guard_publication_expiry();

create or replace function public.guard_expired_application()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.articulos a where a.id = new.articulo_id
    and a.created_at <= now() - interval '1440 hours') then
    raise exception 'Esta publicacion vencio despues de 60 dias y no acepta nuevas solicitudes.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_expired_application() from public, anon, authenticated;
drop trigger if exists expired_application on public.postulaciones;
create trigger expired_application before insert or update on public.postulaciones
for each row execute function public.guard_expired_application();

create or replace function public.guard_publication_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare old_active boolean;
begin
  if lower(trim(coalesce(nullif(new.estado, ''), new.status, 'disponible')))
      in ('entregado', 'delivered') then return new; end if;
  if tg_op = 'UPDATE' then
    old_active := lower(trim(coalesce(nullif(old.estado, ''), old.status, 'disponible')))
      not in ('entregado', 'delivered');
    if old.owner_id = new.owner_id and old_active then return new; end if;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(new.owner_id::text, 2040));
  if (select count(*) from public.articulos a
      where a.owner_id = new.owner_id and a.id is distinct from new.id
        and lower(trim(coalesce(nullif(a.estado, ''), a.status, 'disponible')))
          not in ('entregado', 'delivered')
        and (a.created_at > now() - interval '1440 hours'
          or lower(coalesce(nullif(a.estado, ''), a.status)) in ('reservado', 'reserved'))) >= 20 then
    raise exception 'Puedes tener un máximo de 20 publicaciones activas. Finaliza una entrega o elimina una publicación disponible antes de publicar otra.';
  end if;
  return new;
end;
$$;

create or replace function public.home_article_page(p_filters jsonb default '{}', p_page integer default 1)
returns jsonb language sql stable security invoker set search_path = public as $$
  with normalized as (
    select a.id, a.created_at, a.is_featured,
      coalesce(a.usuario_id, a.owner_id) = auth.uid() as own,
      case lower(trim(coalesce(nullif(a.estado, ''), a.status, 'disponible')))
        when 'available' then 'disponible' when 'reserved' then 'reservado'
        when 'delivered' then 'entregado'
        else lower(trim(coalesce(nullif(a.estado, ''), a.status, 'disponible'))) end as state,
      case when lower(a.mode) like '%don%' or lower(a.mode) like '%regal%' then 'donacion'
        when lower(a.mode) like '%venta%' then 'venta' else lower(trim(a.mode)) end as kind,
      lower(coalesce(a.title, '')) as title,
      lower(trim(coalesce(a.category, a.categoria, ''))) as category,
      lower(trim(coalesce(a.subcategory, a.subcategoria, ''))) as subcategory
    from public.articulos a
    where a.created_at > now() - interval '1440 hours'
      and a.city = coalesce(p_filters->>'city', 'Bogotá')
      and (coalesce(p_filters->>'locality', 'Todas') = 'Todas' or a.locality = p_filters->>'locality')
  ), filtered as materialized (
    select * from normalized
    where not (coalesce((p_filters->>'hideOwn')::boolean, false) and coalesce(own, false))
      and state not in ('pausado', 'entregado')
      and (not coalesce((p_filters->>'onlyActive')::boolean, true) or state <> 'reservado')
      and (coalesce(p_filters->>'kind', 'todo') = 'todo'
        or (p_filters->>'kind' = 'destacado' and is_featured)
        or kind = p_filters->>'kind')
      and (coalesce(p_filters->>'category', 'Todo') = 'Todo' or category = lower(trim(p_filters->>'category')))
      and (coalesce(p_filters->>'subcategory', '') = '' or subcategory = lower(trim(p_filters->>'subcategory')))
      and (coalesce(trim(p_filters->>'search'), '') = ''
        or strpos(title, lower(trim(p_filters->>'search'))) > 0
        or strpos(category, lower(trim(p_filters->>'search'))) > 0
        or strpos(subcategory, lower(trim(p_filters->>'search'))) > 0)
  ), totals as (
    select count(*) as total,
      least(greatest(coalesce(p_page, 1), 1), greatest(1, ceil(count(*) / 9.0)::integer)) as page
    from filtered
  ), page_ids as (
    select id from filtered
    order by
      case when p_filters->>'sort' = 'oldest' then created_at end asc,
      case when coalesce(p_filters->>'sort', 'newest') <> 'oldest' then created_at end desc,
      id
    limit 9 offset (select (page - 1) * 9 from totals)
  ), featured_ids as (
    select id from filtered where is_featured
    order by md5(id::text || coalesce(p_filters->>'featuredSeed', '')) limit 12
  )
  select jsonb_build_object('total', total, 'page', page,
    'ids', coalesce((select jsonb_agg(id) from page_ids), '[]'::jsonb),
    'featuredIds', coalesce((select jsonb_agg(id) from featured_ids), '[]'::jsonb)) from totals;
$$;
revoke all on function public.home_article_page(jsonb, integer) from public;
grant execute on function public.home_article_page(jsonb, integer) to anon, authenticated;

notify pgrst, 'reload schema';
commit;
