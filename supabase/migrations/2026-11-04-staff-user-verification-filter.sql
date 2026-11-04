begin;
-- Dedicated users projection keeps all existing filters and applies verification
-- before counting/pagination. Other staff queues retain their existing definitions.
create or replace function public.staff_user_verification_page(p_search text default '',p_page integer default 1,p_filters jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare filters jsonb:=coalesce(p_filters,'{}');term text:=left(trim(coalesce(p_search,'')),100);
begin
 perform public.staff_require('users');
 if jsonb_typeof(filters) is distinct from 'object' or coalesce(filters->>'verification','') not in ('','verified','unverified') then
  raise exception 'Filtro de verificación inválido.';end if;
 return (with candidates as materialized (
  select u.id,u.nombre,u.foto_url,u.ciudad,u.localidad,u.created_at,
   coalesce(u.is_blocked,false) or coalesce(u.bloqueado,false) as is_blocked,u.ban_until,
   coalesce(v.status='approved',false) as account_verified,v.revision as verification_revision
  from public.usuarios u join auth.users a on a.id=u.id
  left join public.account_verifications v on v.user_id=u.id
  where position(lower(term) in lower(concat(u.nombre,' ',a.email,' ',u.movil,' ',u.id)))>0
   and (coalesce(filters->>'city','')='' or u.ciudad=filters->>'city')
   and (coalesce(filters->>'locality','')='' or u.localidad=filters->>'locality')
   and (coalesce(filters->>'state','')='' or
    (filters->>'state'='blocked' and (u.is_blocked or u.bloqueado)) or
    (filters->>'state'='suspended' and not(u.is_blocked or u.bloqueado) and u.ban_until>now()) or
    (filters->>'state'='active' and not(u.is_blocked or u.bloqueado) and (u.ban_until is null or u.ban_until<=now())))
   and (coalesce(filters->>'reported','')<>'yes' or exists(select 1 from public.staff_publication_history h
    join public.staff_publication_reports r on r.article_id=h.article_id where h.owner_id=u.id))
   and (coalesce(filters->>'verification','')='' or
    (filters->>'verification'='verified' and v.status='approved') or
    (filters->>'verification'='unverified' and coalesce(v.status,'')<>'approved'))
 ), totals as (select count(*) as total from candidates), bounds as (
  select total,greatest(1,ceil(total/20.0)::integer) as pages,
   least(greatest(1,coalesce(p_page,1)),greatest(1,ceil(total/20.0)::integer)) as page from totals
 ), chosen as (
  select c.*,coalesce((select saldo from public.cupos where usuario_id=c.id),0) as credits,
   public.staff_user_stats(c.id) as stats
  from candidates c order by c.created_at desc,c.id limit 20 offset (select (page-1)::bigint*20 from bounds)
 )
 select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at desc,c.id) from chosen c),'[]'::jsonb),
  'total',total,'page',page,'pageCount',pages) from bounds);
end $$;
revoke all on function public.staff_user_verification_page(text,integer,jsonb) from public,anon,authenticated;
grant execute on function public.staff_user_verification_page(text,integer,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
