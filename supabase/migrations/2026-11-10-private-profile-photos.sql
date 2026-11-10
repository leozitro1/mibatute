begin;
set local lock_timeout='4s';
set local statement_timeout='20s';

-- Keep the existing columns and authenticated consumers of this view.
create or replace view public.usuarios_publicos with (security_invoker=false,security_barrier=true) as
 select id,nombre,ciudad,localidad,
   case when (select auth.uid()) is not null and (select auth.jwt()->>'is_anonymous') is distinct from 'true' then foto_url else null end as foto_url,
   is_blocked,bloqueado,ban_until,public.account_is_verified(id) as account_verified
 from public.usuarios;

notify pgrst,'reload schema';
commit;
