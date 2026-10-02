begin;
alter table public.chats add column if not exists approved_at timestamptz;

create or replace function public.record_sale_approval()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare a public.articulos%rowtype;
begin
  select * into a from public.articulos where id = new.articulo_id;
  if tg_op = 'INSERT' then new.approved_at := null;
  else new.approved_at := old.approved_at;
  end if;
  if a.mode <> 'venta' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'closed' and new.status = 'pending' then
    new.approved_at := null;
  elsif new.status = 'open' and new.approved_at is null then
    new.approved_at := now();
  end if;
  return new;
end;
$$;
drop trigger if exists record_sale_approval on public.chats;
create trigger record_sale_approval before insert or update on public.chats
for each row execute function public.record_sale_approval();
update public.chats c set approved_at = now()
from public.articulos a where a.id = c.articulo_id and a.mode = 'venta'
  and a.buyer_id = c.buyer_id and a.status = 'reservado' and c.status = 'open' and c.approved_at is null;

create or replace function public.guard_approved_sale_update()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if old.mode <> 'venta' or auth.uid() is null then return new; end if;
  if old.status = 'entregado' and (new.status is distinct from old.status
    or new.estado is distinct from old.estado or new.buyer_id is distinct from old.buyer_id
    or new.delivered_at is distinct from old.delivered_at or new.mode is distinct from old.mode
    or new.owner_id is distinct from old.owner_id) then
    raise exception 'Una venta entregada no puede reabrirse ni cambiar su fecha de entrega.' using errcode = '42501';
  end if;
  if old.status = 'reservado' and auth.uid() in (old.owner_id, old.buyer_id)
    and (new.status not in ('reservado', 'entregado') or new.estado not in ('reservado', 'entregado')
      or new.buyer_id is distinct from old.buyer_id or new.mode is distinct from old.mode
      or new.owner_id is distinct from old.owner_id)
    and exists (select 1 from public.chats where articulo_id = old.id
      and buyer_id = old.buyer_id and approved_at is not null) then
    raise exception 'La venta ya fue aprobada. Finalizala confirmando la entrega.' using errcode = '42501';
  end if;
  if old.status <> 'entregado' and new.status = 'entregado' then
    new.delivered_at := now();
  end if;
  return new;
end;
$$;
drop trigger if exists guard_approved_sale_update on public.articulos;
create trigger guard_approved_sale_update before update on public.articulos
for each row execute function public.guard_approved_sale_update();

create or replace function public.assert_sale_deletable(p_article_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare a public.articulos%rowtype;
begin
  -- Trusted service cleanup remains available; user-facing deletes are protected.
  if auth.uid() is null then return; end if;
  select * into a from public.articulos where id = p_article_id for update;
  if a.mode = 'venta' and ((a.status = 'reservado' and a.buyer_id is not null)
    or (a.status = 'entregado' and (coalesce(a.delivered_at, a.updated_at) is null
      or now() < coalesce(a.delivered_at, a.updated_at) + interval '7 days'))) then
    raise exception 'No puedes eliminar esta venta. Se conserva siete dias desde la entrega.' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.guard_sale_delete()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare article_id uuid;
begin
  if tg_table_name = 'articulos' then article_id := old.id;
  elsif tg_table_name in ('chat_messages', 'chat_reads') then
    select articulo_id into article_id from public.chats where id = old.chat_id;
  else article_id := old.articulo_id;
  end if;
  perform public.assert_sale_deletable(article_id);
  return old;
end;
$$;
do $$
declare table_name text;
begin
  foreach table_name in array array['articulos','chats','chat_messages','chat_reads','postulaciones','articulo_imagenes'] loop
    execute format('drop trigger if exists guard_sale_delete on public.%I', table_name);
    execute format('create trigger guard_sale_delete before delete on public.%I for each row execute function public.guard_sale_delete()', table_name);
  end loop;
end;
$$;

create or replace function public.delete_article_deep(p_articulo_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare a public.articulos%rowtype;
begin
  select * into a from public.articulos where id = p_articulo_id for update;
  if auth.uid() is null or a.owner_id is distinct from auth.uid() then
    raise exception 'Solo el propietario puede eliminar esta publicacion.' using errcode = '42501';
  end if;
  perform public.assert_sale_deletable(p_articulo_id);
  delete from public.chat_messages where chat_id in (select id from public.chats where articulo_id = p_articulo_id);
  delete from public.chat_reads where chat_id in (select id from public.chats where articulo_id = p_articulo_id);
  delete from public.chats where articulo_id = p_articulo_id;
  delete from public.postulaciones where articulo_id = p_articulo_id;
  delete from public.postulaciones_rechazadas where articulo_id = p_articulo_id;
  delete from public.postulacion_historial where articulo_id = p_articulo_id;
  delete from public.reports where articulo_id = p_articulo_id;
  delete from public.chat_reports where articulo_id = p_articulo_id;
  delete from public.articulo_imagenes where articulo_id = p_articulo_id;
  delete from public.articulos where id = p_articulo_id;
end;
$$;
revoke all on function public.delete_article_deep(uuid) from public, anon;
grant execute on function public.delete_article_deep(uuid) to authenticated;
revoke all on function public.record_sale_approval(), public.guard_approved_sale_update(),
  public.assert_sale_deletable(uuid), public.guard_sale_delete() from public, anon, authenticated;
notify pgrst, 'reload schema';
commit;
