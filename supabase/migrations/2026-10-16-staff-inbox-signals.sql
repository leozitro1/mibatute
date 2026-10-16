begin;

-- Only metadata travels over Realtime. Message bodies stay behind notification_inbox.
create or replace function public.staff_inbox_signal()
returns trigger language plpgsql security definer set search_path='' as $$
declare message public.staff_messages%rowtype;topic text;
begin
  if tg_table_name='staff_messages' then
    if new.audience<>'all' then return new;end if;
    message:=new;topic:='mb:inbox:all';
  else
    select * into message from public.staff_messages where id=new.message_id;
    if not found or message.audience<>'selected' then return new;end if;
    topic:='mb:inbox:user:'||new.user_id::text;
  end if;
  perform realtime.send(jsonb_build_object('id',message.id,'created_at',message.created_at,
    'audience_cutoff',message.audience_cutoff),'inbox_notice',topic,true);
  return new;
end;
$$;
revoke all on function public.staff_inbox_signal() from public,anon,authenticated;
drop trigger if exists staff_inbox_signal_all on public.staff_messages;
create trigger staff_inbox_signal_all after insert on public.staff_messages
  for each row execute function public.staff_inbox_signal();
drop trigger if exists staff_inbox_signal_selected on public.staff_message_recipients;
create trigger staff_inbox_signal_selected after insert on public.staff_message_recipients
  for each row execute function public.staff_inbox_signal();

drop policy if exists mb_inbox_receive on realtime.messages;
create policy mb_inbox_receive on realtime.messages for select to authenticated using(
  extension='broadcast' and topic=(select realtime.topic()) and (select auth.uid()) is not null
  and (topic='mb:inbox:all' or topic='mb:inbox:user:'||(select auth.uid())::text)
);
-- Guard these topics even if another application policy allows broader channel access.
drop policy if exists mb_inbox_receive_guard on realtime.messages;
create policy mb_inbox_receive_guard on realtime.messages as restrictive for select to authenticated using(
  topic not like 'mb:inbox:%' or (extension='broadcast' and topic=(select realtime.topic())
    and (select auth.uid()) is not null and (topic='mb:inbox:all' or topic='mb:inbox:user:'||(select auth.uid())::text))
);
drop policy if exists mb_inbox_publish_guard on realtime.messages;
create policy mb_inbox_publish_guard on realtime.messages as restrictive for insert to authenticated
  with check(topic not like 'mb:inbox:%');

-- Replace the existing activity read, rather than adding an inbox query on every visit.
create or replace function public.notification_activity_feed()
returns setof jsonb language sql stable security definer set search_path='' as $$
  with viewer as(select id,created_at from auth.users where id=auth.uid()),
  activity as(select id,type,articulo_id,chat_id,buyer_id,receipt_id,created_at,title,subtitle,thumb,
      'system'::text as receipt_kind,false as read from public.activity_notifications
    where recipient_id=auth.uid() order by created_at desc,id limit 10),
  general as(select m.id,m.created_at from public.staff_messages m join viewer v on v.created_at<=m.audience_cutoff
    where m.audience='all' and not exists(select 1 from public.staff_message_states where message_id=m.id and user_id=auth.uid() and hidden_at is not null)
    order by m.created_at desc,m.id limit 50),
  selected as(select m.id,m.created_at from public.staff_message_recipients r join public.staff_messages m on m.id=r.message_id
    where r.user_id=auth.uid() and not exists(select 1 from public.staff_message_states where message_id=m.id and user_id=auth.uid() and hidden_at is not null)
    order by m.created_at desc,m.id limit 50),
  staff as(select m.*,s.read_at from(select * from general union all select * from selected)m
    left join public.staff_message_states s on s.message_id=m.id and s.user_id=auth.uid()
    where s.hidden_at is null order by m.created_at desc,m.id limit 50),
  notices as(select to_jsonb(a) as item,a.created_at,a.id from activity a
    union all select jsonb_build_object('id','inbox-staff-'||id::text,'type','system_notice',
      'receipt_id',id,'receipt_kind','staff','created_at',created_at,'title','Mensaje de MiBatute',
      'subtitle','Tienes un mensaje en tu buzon.','read',read_at is not null),created_at,'inbox-staff-'||id::text from staff)
  select item from notices order by created_at desc,id limit 60;
$$;
revoke all on function public.notification_activity_feed() from public,anon;
grant execute on function public.notification_activity_feed() to authenticated;
notify pgrst,'reload schema';
commit;
