begin;
-- Reuse the existing append-only staff audit rather than reconstructing decisions
-- from the mutable current request. No identity document data is projected.
create index if not exists staff_identity_history_user_idx on public.staff_audit(target_id,created_at desc,id desc)
 where action in ('identity.approved','identity.rejected');

create or replace function public.staff_account_verification_history(p_user_id uuid default null,p_page integer default 1)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform public.staff_require('users');
 if p_page is null or p_page<1 then raise exception 'Página inválida.';end if;
 return jsonb_build_object('total',(select count(*) from public.staff_audit
  where action in ('identity.approved','identity.rejected') and (p_user_id is null or target_id=p_user_id)),
 'rows',coalesce((select jsonb_agg(to_jsonb(q) order by q.created_at desc,q.id desc) from (
  select a.id,a.target_id as user_id,u.nombre as profile_name,a.actor_id,actor.nombre as reviewer_name,a.created_at,
   a.changes->>'from' as previous_status,a.changes->>'to' as decision,a.changes->'revision' as revision,
   v.status as current_status
  from public.staff_audit a left join public.usuarios u on u.id=a.target_id
  left join public.usuarios actor on actor.id=a.actor_id
  left join public.account_verifications v on v.user_id=a.target_id
  where a.action in ('identity.approved','identity.rejected') and (p_user_id is null or a.target_id=p_user_id)
  order by a.created_at desc,a.id desc limit 20 offset (p_page::bigint-1)*20
 ) q),'[]'::jsonb));
end $$;
revoke all on function public.staff_account_verification_history(uuid,integer) from public,anon,authenticated;
grant execute on function public.staff_account_verification_history(uuid,integer) to authenticated;
notify pgrst,'reload schema';
commit;
