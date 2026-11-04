begin;
create extension if not exists pg_cron with schema pg_catalog;
-- The job can be installed safely: the purge refuses to run until explicitly enabled.
select cron.schedule('mibatute-chat-retention','*/15 * * * *','select public.purge_expired_chats(100);');
commit;
