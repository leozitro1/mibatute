begin;
-- Private, ephemeral presence only for the two participants in an open chat.
create or replace function public.chat_presence_allowed(p_topic text)
returns boolean language sql stable security definer set search_path='' as $$
 select (select auth.uid()) is not null
 and not coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false)
 and exists(select 1 from auth.users u where u.id=(select auth.uid()) and u.email_confirmed_at is not null)
 and not exists(select 1 from public.usuarios u where u.id=(select auth.uid())
  and (coalesce(u.is_blocked,false) or coalesce(u.bloqueado,false) or u.ban_until>now()))
 and exists(select 1 from public.chats c where p_topic='mb:chat:'||c.id::text and c.status='open'
  and ((select auth.uid())=c.buyer_id or (select auth.uid())=coalesce(c.seller_id,c.owner_id)));
$$;
revoke all on function public.chat_presence_allowed(text) from public,anon;
grant execute on function public.chat_presence_allowed(text) to authenticated;

drop policy if exists chat_presence_receive on realtime.messages;
create policy chat_presence_receive on realtime.messages for select to authenticated using(
 extension='presence' and topic=(select realtime.topic()) and public.chat_presence_allowed(topic));
drop policy if exists chat_presence_publish on realtime.messages;
create policy chat_presence_publish on realtime.messages for insert to authenticated with check(
 extension='presence' and topic=(select realtime.topic()) and public.chat_presence_allowed(topic));
-- Keep unrelated inbox/support policies intact; broader policies cannot expose these topics.
drop policy if exists chat_presence_receive_guard on realtime.messages;
create policy chat_presence_receive_guard on realtime.messages as restrictive for select to authenticated using(
 topic not like 'mb:chat:%' or (extension='presence' and topic=(select realtime.topic()) and public.chat_presence_allowed(topic)));
drop policy if exists chat_presence_publish_guard on realtime.messages;
create policy chat_presence_publish_guard on realtime.messages as restrictive for insert to authenticated with check(
 topic not like 'mb:chat:%' or (extension='presence' and topic=(select realtime.topic()) and public.chat_presence_allowed(topic)));
commit;
