begin;
-- Simulation only: the separate scheduled worker performs deletions.
create or replace function public.preview_retention(p_limit integer default 20)
returns jsonb language plpgsql security definer set search_path='' as $$
declare stamp timestamptz:=clock_timestamp();result jsonb;
begin
 perform public.staff_require('access');
 with candidates as(
  select 'support'::text as category,t.id,t.closed_at as event_at,t.closed_at+interval '180 days' as proposed_limit
   from public.support_threads t where t.closed_at<=stamp-interval '180 days'
  union all
  select 'data_requests',r.id,r.responded_at,r.responded_at+interval '24 months'
   from public.data_rights_requests r where r.status='answered' and r.responded_at<=stamp-interval '24 months'
  union all
  select 'chats',c.id,r.started_at,r.delete_after
   from public.chats c join public.chat_retention r on r.chat_id=c.id
   where r.delete_after<=stamp and not public.chat_retention_held(c.id)
 ),counts as(select category,count(*) as total from candidates group by category),sample as(
  select * from candidates order by proposed_limit,category,id limit least(greatest(coalesce(p_limit,20),1),50)
 )
 select jsonb_build_object('as_of',stamp,'deletion_enabled',false,'requires_review',true,
  'chat_cleanup_enabled',(select enabled from public.chat_retention_settings where id),
  'counts',coalesce((select jsonb_object_agg(category,total) from counts),'{}'::jsonb),
  'sample',coalesce((select jsonb_agg(to_jsonb(s) order by s.proposed_limit,s.category,s.id) from sample s),'[]'::jsonb),
  'without_event',jsonb_build_object(
   'support',(select count(*) from public.support_threads where closed_at is null),
   'data_requests',(select count(*) from public.data_rights_requests where status<>'answered' or responded_at is null),
   'chats',(select count(*) from public.chats c left join public.chat_retention r on r.chat_id=c.id where r.chat_id is null))) into result;
 return result;
end;
$$;
revoke all on function public.preview_retention(integer) from public,anon;
grant execute on function public.preview_retention(integer) to authenticated;
notify pgrst,'reload schema';
commit;
