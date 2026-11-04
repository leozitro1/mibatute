begin;
select pg_advisory_xact_lock(hashtextextended('mibatute-chat-retention',0));
update public.chat_retention r set started_at=event.at,delete_after=event.at+interval '720 hours'
 from public.chats c join public.articulos a on a.id=c.articulo_id
 cross join lateral(select coalesce(c.retention_closed_at,a.delivered_at,a.updated_at) as at) event
 where r.chat_id=c.id and event.at is not null;
notify pgrst,'reload schema';
commit;
