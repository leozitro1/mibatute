begin;
-- Small acknowledgement records, independent of the ten visible history rows.
create table if not exists public.notification_bell_reads (
 user_id uuid not null references auth.users(id) on delete cascade,
 notification_key text not null check(length(notification_key)<=240),
 seen_at timestamptz not null,
 primary key(user_id,notification_key)
);
alter table public.notification_bell_reads enable row level security;
revoke all on public.notification_bell_reads from public,anon,authenticated;

create or replace function public.notification_bell_ack(p_items jsonb,p_action text default 'read')
returns void language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();item jsonb;k text;stamp timestamptz;
begin
 if uid is null then raise exception 'Debes iniciar sesión.' using errcode='42501';end if;
 if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items)>300
  or p_action not in ('read','unread') or p_action is null then
  raise exception 'Acuse de notificaciones inválido.' using errcode='22023';
 end if;
 for item in select value from jsonb_array_elements(p_items) loop
  k:=item->>'key';stamp:=(item->>'created_at')::timestamptz;
  if k is null or length(k)>240 or k !~ '^(receipt\|(system|staff|support)\|)?[A-Za-z0-9][A-Za-z0-9._:-]*$'
   or stamp is null or not isfinite(stamp) or stamp<'1970-01-01'::timestamptz or stamp>clock_timestamp() then
   raise exception 'Acuse de notificaciones inválido.' using errcode='22023';
  end if;
  if p_action='unread' then
   delete from public.notification_bell_reads where user_id=uid and notification_key=k;
  else
   insert into public.notification_bell_reads values(uid,k,stamp)
   on conflict(user_id,notification_key) do update set seen_at=excluded.seen_at
    where public.notification_bell_reads.seen_at<excluded.seen_at;
  end if;
 end loop;
end;
$$;
revoke all on function public.notification_bell_ack(jsonb,text) from public,anon;
grant execute on function public.notification_bell_ack(jsonb,text) to authenticated;

-- Reuse the current feed and its visibility rules; one indexed join, no new client read.
do $$ begin
 if to_regprocedure('public.notification_activity_feed_before_bell_sync()') is null then
  alter function public.notification_activity_feed() rename to notification_activity_feed_before_bell_sync;
 end if;
end $$;
revoke all on function public.notification_activity_feed_before_bell_sync() from public,anon,authenticated;
create or replace function public.notification_activity_feed()
returns setof jsonb language sql stable security definer set search_path='' as $$
 select f.item || jsonb_build_object('bellRead',coalesce((f.item->>'bellRead')::boolean,false)
  or (r.notification_key is not null and (
   (f.item->>'type'='system_notice' and f.item->>'receipt_id' is not null and coalesce(f.item->>'receipt_kind','system')<>'support')
   or (f.item->>'created_at')::timestamptz<=r.seen_at)))
 from public.notification_activity_feed_before_bell_sync() with ordinality as f(item,position)
 left join public.notification_bell_reads r on r.user_id=auth.uid() and r.notification_key=
  case when f.item->>'type'='system_notice' and f.item->>'receipt_id' is not null
   then 'receipt|'||coalesce(f.item->>'receipt_kind','system')||'|'||(f.item->>'receipt_id')
   else f.item->>'id' end
 order by f.position;
$$;
revoke all on function public.notification_activity_feed() from public,anon;
grant execute on function public.notification_activity_feed() to authenticated;
-- Existing read/unread actions also synchronize the bell in their current request.
do $$ begin
 if to_regprocedure('public.notification_receipt_action_before_bell_sync(uuid,text)') is null then
  alter function public.notification_receipt_action(uuid,text) rename to notification_receipt_action_before_bell_sync;
 end if;
 if to_regprocedure('public.staff_message_receipt_action_before_bell_sync(uuid,text)') is null then
  alter function public.staff_message_receipt_action(uuid,text) rename to staff_message_receipt_action_before_bell_sync;
 end if;
end $$;
revoke all on function public.notification_receipt_action_before_bell_sync(uuid,text),public.staff_message_receipt_action_before_bell_sync(uuid,text) from public,anon,authenticated;

create or replace function public.notification_receipt_action(p_receipt_id uuid,p_action text)
returns void language plpgsql security definer set search_path='' as $$
begin
 perform public.notification_receipt_action_before_bell_sync(p_receipt_id,p_action);
 if p_action in ('read','unread') then
  perform public.notification_bell_ack(jsonb_build_array(jsonb_build_object(
   'key','receipt|system|'||p_receipt_id::text,'created_at',clock_timestamp())),p_action);
 end if;
end;
$$;
create or replace function public.staff_message_receipt_action(p_message uuid,p_action text)
returns void language plpgsql security definer set search_path='' as $$
begin
 perform public.staff_message_receipt_action_before_bell_sync(p_message,p_action);
 if p_action in ('read','unread') then
  perform public.notification_bell_ack(jsonb_build_array(jsonb_build_object(
   'key','receipt|staff|'||p_message::text,'created_at',clock_timestamp())),p_action);
 end if;
end;
$$;
revoke all on function public.notification_receipt_action(uuid,text),public.staff_message_receipt_action(uuid,text) from public,anon;
grant execute on function public.notification_receipt_action(uuid,text),public.staff_message_receipt_action(uuid,text) to authenticated;

notify pgrst,'reload schema';
commit;
