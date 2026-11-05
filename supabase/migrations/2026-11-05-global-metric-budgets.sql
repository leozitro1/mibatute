begin;

-- Exactly three mutable counters, not a growing request log.
create table if not exists public.metric_write_budgets (
 kind text primary key check(kind in ('article_views','market','sponsors')),
 minute_start timestamptz not null default '-infinity',
 minute_used integer not null default 0 check(minute_used>=0),
 window_day date not null default '1970-01-01',
 day_used integer not null default 0 check(day_used>=0),
 minute_limit integer not null default 300 check(minute_limit between 1 and 10000),
 day_limit integer not null default 10000 check(day_limit between 1 and 1000000)
);
insert into public.metric_write_budgets(kind) values('article_views'),('market'),('sponsors') on conflict do nothing;
alter table public.metric_write_budgets enable row level security;
revoke all on public.metric_write_budgets from public,anon,authenticated;
grant all on public.metric_write_budgets to service_role;

create or replace function public.reserve_metric_budget(p_kind text,p_units integer)
returns boolean language plpgsql security definer set search_path='' as $$
declare budget public.metric_write_budgets%rowtype;stamp timestamptz:=clock_timestamp();
 minute_window timestamptz;day_window date;minute_count integer;day_count integer;
begin
 if p_kind is null or p_kind not in ('article_views','market','sponsors')
   or p_units is null or p_units not between 1 and 20 then return false;end if;
 -- Stats are optional: shed concurrent work instead of queuing on a hot row.
 begin
  select * into budget from public.metric_write_budgets where kind=p_kind for update nowait;
 exception when lock_not_available then return false;
 end;
 if not found then return false;end if;
 minute_window:=date_trunc('minute',stamp);
 day_window:=(stamp at time zone 'America/Bogota')::date;
 minute_count:=case when budget.minute_start=minute_window then budget.minute_used else 0 end;
 day_count:=case when budget.window_day=day_window then budget.day_used else 0 end;
 if minute_count+p_units>budget.minute_limit or day_count+p_units>budget.day_limit then return false;end if;
 update public.metric_write_budgets set minute_start=minute_window,minute_used=minute_count+p_units,
  window_day=day_window,day_used=day_count+p_units where kind=p_kind;
 return true;
end $$;
revoke all on function public.reserve_metric_budget(text,integer) from public,anon,authenticated;
grant execute on function public.reserve_metric_budget(text,integer) to service_role;

-- Wrap each installed body at its existing validation/locking point, preserving
-- every following validation, deduplication rule, grant and return type.
do $migration$
declare signature text;definition text;source text;anchor text;guard text;kind text;
begin
 foreach signature in array array['public.record_article_view(uuid,uuid)',
   'public.record_market_metrics(uuid,jsonb)','public.record_sponsor_metrics(uuid,jsonb)'] loop
  select pg_get_functiondef(p.oid),p.prosrc into strict definition,source
   from pg_proc p join pg_language l on l.oid=p.prolang
   where p.oid=signature::regprocedure and p.prosecdef and l.lanname='plpgsql' and p.provolatile='v';
  if position('global_metric_budget_v1' in source)>0 then continue;end if;
  if signature='public.record_article_view(uuid,uuid)' then
   anchor:='if p_session is null then return false;end if;';
   guard:=anchor||E'\n -- global_metric_budget_v1\n if not public.reserve_metric_budget(''article_views'',1) then return false;end if;';
  else
   kind:=case when signature='public.record_market_metrics(uuid,jsonb)' then 'market' else 'sponsors' end;
   anchor:='perform pg_advisory_xact_lock(hashtextextended(p_visit::text,'||case when kind='market' then '20261017' else '20261016' end||'));';
   guard:=E'-- global_metric_budget_v1\n if octet_length(p_events::text)>24000 then raise exception ''Lote no valido.'';end if;\n'
    ||E' if jsonb_array_length(p_events)=0 then return;end if;\n'
    ||format(' if not public.reserve_metric_budget(%L,jsonb_array_length(p_events)) then return;end if;',kind)
    ||E'\n '||anchor;
  end if;
  if (length(source)-length(replace(source,anchor,'')))/length(anchor)<>1
    or position(source in definition)=0 then
   raise exception 'La función % cambió; revisar antes de limitar sus métricas.',signature;
  end if;
  execute replace(definition,source,replace(source,anchor,guard));
 end loop;
end $migration$;

notify pgrst,'reload schema';
commit;
