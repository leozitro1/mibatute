begin;
-- Expose only status booleans, never seller documents, addresses or phone numbers.
create or replace function public.seller_is_registered(p_user_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.seller_registrations r join public.usuarios u on u.id=r.user_id
  where r.user_id=p_user_id and r.consent_version='seller-2026-11-10.1'
  and not coalesce(u.is_blocked,false) and not coalesce(u.bloqueado,false)
  and (u.ban_until is null or u.ban_until<=now()));
$$;
create or replace function public.account_public_badges(p_user_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('account_verified',public.account_is_verified(p_user_id),
  'seller_registered',public.seller_is_registered(p_user_id));
$$;
revoke all on function public.seller_is_registered(uuid),public.account_public_badges(uuid) from public;
grant execute on function public.seller_is_registered(uuid),public.account_public_badges(uuid) to anon,authenticated;

-- Append to the current view, preserving its existing fields and private-photo logic.
do $$ declare definition text;begin
 if not exists(select 1 from pg_attribute where attrelid='public.usuarios_publicos'::regclass
  and attname='seller_registered' and not attisdropped) then
  definition:=rtrim(pg_get_viewdef('public.usuarios_publicos'::regclass,true),E';\n ');
  execute 'create or replace view public.usuarios_publicos with (security_invoker=false,security_barrier=true) as select v.*,public.seller_is_registered(v.id) as seller_registered from ('||definition||') v';
 end if;
end $$;
notify pgrst,'reload schema';
commit;
