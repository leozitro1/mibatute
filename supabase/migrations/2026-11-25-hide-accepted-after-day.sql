begin;
alter table public.articulos add column if not exists catalog_hide_at timestamptz;

-- Server-owned deadline. Unrelated edits and views never restart the clock.
create or replace function public.record_catalog_reservation_deadline()
returns trigger language plpgsql security definer set search_path='' as $$
declare state text:=lower(coalesce(nullif(new.estado,''),new.status,''));winner uuid:=coalesce(new.ganador_id,new.winner_id,new.recipient_id);accepted timestamptz;
begin
 if tg_op='UPDATE' and new.mode is not distinct from old.mode and new.estado is not distinct from old.estado
  and new.status is not distinct from old.status and new.buyer_id is not distinct from old.buyer_id
  and new.ganador_id is not distinct from old.ganador_id and new.winner_id is not distinct from old.winner_id
  and new.recipient_id is not distinct from old.recipient_id and new.catalog_hide_at is not distinct from old.catalog_hide_at then
  return new;
 end if;
 if state not in ('reservado','reserved') then new.catalog_hide_at:=null;return new;end if;
 if new.mode='venta' and new.buyer_id is not null then
  select min(c.approved_at) into accepted from public.chats c where c.articulo_id=new.id
   and c.buyer_id=new.buyer_id and c.status='open' and c.approved_at is not null;
  new.catalog_hide_at:=accepted+interval '24 hours';
 elsif new.mode='donacion' and winner is not null then
  if tg_op='UPDATE' and old.mode='donacion' and lower(coalesce(nullif(old.estado,''),old.status,'')) in ('reservado','reserved')
   and winner=coalesce(old.ganador_id,old.winner_id,old.recipient_id) then
   if old.catalog_hide_at is not null then new.catalog_hide_at:=old.catalog_hide_at;return new;end if;
   -- Older reservations without a reliable date receive one day from migration.
   accepted:=coalesce(old.reserved_at,clock_timestamp());
  else accepted:=clock_timestamp();end if;
  new.catalog_hide_at:=accepted+interval '24 hours';
 else new.catalog_hide_at:=null;
 end if;
 return new;
end;
$$;
revoke all on function public.record_catalog_reservation_deadline() from public,anon,authenticated;
drop trigger if exists catalog_reservation_deadline on public.articulos;
create trigger catalog_reservation_deadline before insert or update on public.articulos
for each row execute function public.record_catalog_reservation_deadline();

-- Approval already writes the chat: update the deadline in that transaction, never per message.
create or replace function public.sync_sale_catalog_deadline()
returns trigger language plpgsql security definer set search_path='' as $$
declare article_id uuid:=case when tg_op='DELETE' then old.articulo_id else new.articulo_id end;deadline timestamptz;
begin
 select min(c.approved_at)+interval '24 hours' into deadline from public.chats c
 join public.articulos a on a.id=c.articulo_id and a.buyer_id=c.buyer_id
 where a.id=article_id and a.mode='venta' and c.status='open' and c.approved_at is not null;
 update public.articulos a set catalog_hide_at=deadline where a.id=article_id and a.mode='venta'
  and lower(coalesce(nullif(a.estado,''),a.status,'')) in ('reservado','reserved') and a.catalog_hide_at is distinct from deadline;
 return null;
end;
$$;
revoke all on function public.sync_sale_catalog_deadline() from public,anon,authenticated;
drop trigger if exists sale_catalog_deadline on public.chats;
create trigger sale_catalog_deadline after insert or delete or update of status,approved_at,buyer_id,articulo_id on public.chats
for each row execute function public.sync_sale_catalog_deadline();

-- Recompute only reservation rows; the trigger ignores this supplied sentinel and uses trusted dates.
update public.articulos set catalog_hide_at='infinity'::timestamptz
 where lower(coalesce(nullif(estado,''),status,'')) in ('reservado','reserved');

do $migration$
declare definition text;anchor text:=$anchor$and a.city = coalesce(p_filters->>'city', 'Bogotá')$anchor$;
begin
 select pg_get_functiondef('public.home_article_page(jsonb,integer)'::regprocedure) into definition;
 if strpos(definition,'catalog_hide_at')=0 then
  if strpos(definition,anchor)=0 then raise exception 'Cambió el catálogo. Revisa su filtro antes de migrar.';end if;
  execute replace(definition,anchor,'and (a.catalog_hide_at is null or a.catalog_hide_at>now())'||E'\n      '||anchor);
 end if;
end $migration$;
notify pgrst,'reload schema';
commit;
