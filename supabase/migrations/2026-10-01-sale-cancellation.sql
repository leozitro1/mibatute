begin;
alter table public.chats add column if not exists canceled_at timestamptz;
alter table public.chats add column if not exists canceled_by uuid;

-- Cancellation metadata is derived on the server, never trusted from clients.
create or replace function public.record_sale_cancellation()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  a public.articulos%rowtype;
begin
  if tg_op = 'INSERT' then
    new.canceled_at := null;
    new.canceled_by := null;
    return new;
  end if;
  new.canceled_at := old.canceled_at;
  new.canceled_by := old.canceled_by;
  select * into a from public.articulos where id = new.articulo_id;
  if a.mode <> 'venta' then return new; end if;
  if new.status = 'closed' and old.canceled_at is null
    and a.status = 'disponible' and a.estado = 'disponible'
    and auth.uid() in (a.owner_id, old.buyer_id) then
    new.canceled_at := now();
    new.canceled_by := auth.uid();
  elsif new.status in ('pending', 'open') and old.status = 'closed' then
    new.canceled_at := null;
    new.canceled_by := null;
  end if;
  return new;
end;
$$;
drop trigger if exists record_sale_cancellation on public.chats;
create trigger record_sale_cancellation before insert or update on public.chats
for each row execute function public.record_sale_cancellation();
revoke all on function public.record_sale_cancellation() from public, anon, authenticated;
notify pgrst, 'reload schema';
commit;
