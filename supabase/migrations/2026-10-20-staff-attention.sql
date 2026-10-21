begin;

create index if not exists staff_attention_reports_idx on public.reports(status) where status in('open','reviewing');
create index if not exists staff_attention_chat_reports_idx on public.chat_reports(status) where status in('open','reviewing');
create index if not exists staff_attention_privacy_idx on public.data_rights_requests(status) where status in('open','reviewing');

create or replace function public.staff_attention_summary()
returns jsonb language plpgsql security definer set search_path='' as $$
declare articles integer:=0; reports integer:=0; privacy integer; inbox integer; team integer:=0;
begin
  perform public.staff_require('access');
  if public.staff_permission('moderation') then
    select count(*) into articles from public.articulos where review_status in('pending','en_revision','reviewing');
  end if;
  if public.staff_permission('reports') then
    select (select count(*) from public.reports where status in('open','reviewing'))+
      (select count(*) from public.chat_reports where status in('open','reviewing')) into reports;
  end if;
  select count(*) into privacy from public.data_rights_requests where status in('open','reviewing');
  select count(*) into inbox from public.support_threads t left join public.support_staff_reads r
    on r.thread_id=t.id and r.staff_id=auth.uid() where t.last_user_seq>coalesce(r.last_seen_seq,0);
  if public.staff_permission('team') then select count(*) into team from public.staff_accounts where active; end if;
  return jsonb_build_object('articles',articles,'reports',reports,'privacy',privacy,'inbox',inbox,'team',team,
    'pending',articles+reports+privacy+inbox);
end;
$$;
revoke all on function public.staff_attention_summary() from public,anon;
grant execute on function public.staff_attention_summary() to authenticated;

-- Reuse the existing private staff support topic, protected by staff_permission/MFA.
-- Send only invalidation metadata; never a report, identity or message body.
create or replace function public.staff_attention_signal()
returns trigger language plpgsql security definer set search_path='' as $$
declare section text; payload jsonb; relevant boolean:=true;
begin
  if tg_table_name='articulos' then
    section:='articles';
    if tg_op='UPDATE' and new.review_status is not distinct from old.review_status then return new;end if;
    relevant:=case when tg_op='INSERT' then new.review_status in('pending','en_revision','reviewing')
      when tg_op='DELETE' then old.review_status in('pending','en_revision','reviewing')
      else old.review_status in('pending','en_revision','reviewing') or new.review_status in('pending','en_revision','reviewing') end;
  elsif tg_table_name in('reports','chat_reports','data_rights_requests') then
    section:=case when tg_table_name='data_rights_requests' then 'privacy' else 'reports' end;
    -- Changes to work notes are relevant to an open privacy case, even without a status change.
    if tg_op='UPDATE' and tg_table_name<>'data_rights_requests' and new.status is not distinct from old.status then return new;end if;
    relevant:=case when tg_op='INSERT' then new.status in('open','reviewing')
      when tg_op='DELETE' then old.status in('open','reviewing')
      else old.status in('open','reviewing') or new.status in('open','reviewing') end;
  elsif tg_table_name='support_threads' then
    section:='inbox';
    if tg_op='UPDATE' and row(new.last_message_seq,new.closed_at,new.user_hidden_at) is not distinct from
      row(old.last_message_seq,old.closed_at,old.user_hidden_at) then return new;end if;
  else
    section:='inbox';
    if tg_op='UPDATE' and new.last_seen_seq is not distinct from old.last_seen_seq then return new;end if;
  end if;
  if not coalesce(relevant,false) then
    if tg_op='DELETE' then return old;else return new;end if;
  end if;
  payload:=jsonb_build_object('section',section,'refresh_list',tg_table_name<>'support_staff_reads');
  if tg_table_name='support_staff_reads' then
    payload:=payload||jsonb_build_object('staff_id',case when tg_op='DELETE' then old.staff_id else new.staff_id end);
  end if;
  perform realtime.send(payload,'staff_attention_changed','mb:support:staff',true);
  if tg_op='DELETE' then return old;else return new;end if;
end;
$$;
revoke all on function public.staff_attention_signal() from public,anon,authenticated;
do $$declare table_name text;begin
  foreach table_name in array array['articulos','reports','chat_reports','data_rights_requests','support_threads','support_staff_reads'] loop
    execute format('drop trigger if exists staff_attention_signal on public.%I',table_name);
    execute format('create trigger staff_attention_signal after insert or update or delete on public.%I for each row execute function public.staff_attention_signal()',table_name);
  end loop;
end;$$;
notify pgrst,'reload schema';
commit;
