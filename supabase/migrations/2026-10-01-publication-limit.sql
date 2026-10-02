-- Delivered history does not consume a publication slot.
create or replace function public.guard_publication_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  old_active boolean;
begin
  if lower(trim(coalesce(nullif(new.estado, ''), new.status, 'disponible')))
      in ('entregado', 'delivered') then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    old_active := lower(trim(coalesce(nullif(old.estado, ''), old.status, 'disponible')))
      not in ('entregado', 'delivered');
    if old.owner_id = new.owner_id and old_active then return new; end if;
  end if;

  -- Serialize new publications for the same owner, including concurrent requests.
  perform pg_advisory_xact_lock(hashtextextended(new.owner_id::text, 2040));
  if (select count(*) from public.articulos a
      where a.owner_id = new.owner_id and a.id is distinct from new.id
        and lower(trim(coalesce(nullif(a.estado, ''), a.status, 'disponible')))
          not in ('entregado', 'delivered')) >= 20 then
    raise exception 'Puedes tener un máximo de 20 publicaciones activas. Finaliza una entrega o elimina una publicación disponible antes de publicar otra.';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_publication_limit() from public, anon, authenticated;
drop trigger if exists publication_limit on public.articulos;
create trigger publication_limit before insert or update on public.articulos
for each row execute function public.guard_publication_limit();
