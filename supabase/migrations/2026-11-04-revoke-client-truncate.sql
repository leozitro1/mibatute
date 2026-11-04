begin;
set local lock_timeout='2s';
set local statement_timeout='10s';

-- RLS does not protect TRUNCATE. The application never needs this SQL privilege.
-- Preserve CRUD, service_role, table contents and all existing RLS policies.
revoke truncate on all tables in schema public from public,anon,authenticated;
alter default privileges for role postgres in schema public
 revoke truncate on tables from public,anon,authenticated;

-- Defaults belonging to supabase_admin require the platform owner's intervention.
-- This migration deliberately does not attempt to impersonate that role.
commit;
