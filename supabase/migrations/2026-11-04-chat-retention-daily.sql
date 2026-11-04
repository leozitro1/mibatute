begin;
-- pg_cron uses UTC: 04:59 UTC is 23:59 in Colombia on the previous date.
-- Reusing the job name replaces its schedule instead of creating a second worker.
do $$begin
 if coalesce(current_setting('cron.timezone',true),'GMT') not in ('GMT','UTC','Etc/UTC') then
  raise exception 'Revisar zona horaria de pg_cron antes de programar la limpieza.';
 end if;
end $$;
select cron.schedule('mibatute-chat-retention','59 4 * * *','select public.purge_expired_chats(100);');
-- Scheduling never changes the explicit erasure activation setting.
commit;
