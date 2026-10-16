begin;

create table if not exists public.market_metrics_settings(
  singleton boolean primary key default true check(singleton),started_at timestamptz not null default now()
);
insert into public.market_metrics_settings(singleton) values(true) on conflict do nothing;
create table if not exists public.market_daily_metrics(
  day date not null,kind text not null check(kind in ('search','view')),
  city text not null,locality text not null,category text not null,dimension text not null,
  hits bigint not null default 0,no_results bigint not null default 0,
  primary key(day,kind,city,locality,category,dimension)
);
create table if not exists public.market_metric_events(
  day date not null,visit_id uuid not null,event_key text not null,
  primary key(day,visit_id,event_key)
);
alter table public.market_metrics_settings enable row level security;
alter table public.market_daily_metrics enable row level security;
alter table public.market_metric_events enable row level security;
revoke all on public.market_metrics_settings,public.market_daily_metrics,public.market_metric_events from public,anon,authenticated;
grant all on public.market_metrics_settings,public.market_daily_metrics,public.market_metric_events to service_role;

alter table public.staff_publication_history add column if not exists first_delivered_at timestamptz;
alter table public.staff_publication_history add column if not exists analytics_category text not null default '';
update public.staff_publication_history h set analytics_category=coalesce(a.category,a.categoria,'')
  from public.articulos a where a.id=h.article_id and h.analytics_category is distinct from coalesce(a.category,a.categoria,'');
update public.staff_publication_history h set first_delivered_at=a.delivered_at
  from public.articulos a where a.id=h.article_id and h.delivered_ever
    and h.first_delivered_at is null and a.delivered_at<=now();
create index if not exists staff_publication_delivery_idx on public.staff_publication_history(first_delivered_at)
  where first_delivered_at is not null;
create index if not exists staff_publication_created_idx on public.staff_publication_history(created_at);
create or replace function public.market_record_delivery()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  update public.staff_publication_history set analytics_category=coalesce(new.category,new.categoria,'')
    where article_id=new.id and analytics_category is distinct from coalesce(new.category,new.categoria,'');
  if new.status='entregado' then
    update public.staff_publication_history set first_delivered_at=coalesce(first_delivered_at,
      case when new.delivered_at<=now() then new.delivered_at else now() end)
      where article_id=new.id and first_delivered_at is null;
  end if;
  return new;
end;
$$;
revoke all on function public.market_record_delivery() from public,anon,authenticated;
-- Run after staff_record_publication so even an inserted delivered article has a history row.
drop trigger if exists zz_market_delivery on public.articulos;
create trigger zz_market_delivery after insert or update of status,delivered_at,category,categoria on public.articulos
  for each row execute function public.market_record_delivery();

create or replace function public.record_market_metrics(p_visit uuid,p_events jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare event jsonb;today date:=(now() at time zone 'America/Bogota')::date;
  event_kind text;term text;v_city text;v_locality text;v_category text;key text;added integer;budget integer;empty_count integer;
begin
  if p_visit is null or jsonb_typeof(p_events) is distinct from 'array' or jsonb_array_length(p_events)>20
    or octet_length(p_events::text)>24000 then raise exception 'Lote no valido.';end if;
  perform pg_advisory_xact_lock(hashtextextended(p_visit::text,20261017));
  select count(*) into budget from public.market_metric_events where day=today and visit_id=p_visit;
  for event in select value from jsonb_array_elements(p_events) loop
    exit when budget>=200;
    event_kind:=event->>'kind';empty_count:=0;
    if event_kind='search' then
      term:=lower(trim(regexp_replace(coalesce(event->>'term',''),'\s+',' ','g')));
      if length(term)>60 or (term<>'' and (length(term)<2 or term!~'^[[:alpha:]0-9 -]+$' or term!~'[[:alpha:]]'
        or length(regexp_replace(term,'[^0-9]','','g'))>=7
        or cardinality(string_to_array(term,' '))>6)) then continue;end if;
      v_city:=trim(coalesce(event->>'city',''));v_locality:=trim(coalesce(event->>'locality',''));
      v_category:=trim(coalesce(event->>'category',''));
      if length(v_city)>100 or length(v_locality)>100 or length(v_category)>100
        or (v_city||v_locality||v_category)~'[^[:alpha:] /().-]' then continue;end if;
      if jsonb_typeof(event->'empty') is distinct from 'boolean' then continue;end if;
      empty_count:=case when (event->>'empty')::boolean then 1 else 0 end;
    elsif event_kind='view' then
      if coalesce(event->>'id','')!~'^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$' then continue;end if;
      -- Only public, current articles can be counted; location/category come from the database.
      select a.id::text,coalesce(a.city,''),coalesce(a.locality,''),coalesce(a.category,a.categoria,'')
        into term,v_city,v_locality,v_category from public.articulos a
        where a.id=(event->>'id')::uuid and a.status in ('disponible','reservado')
          and a.created_at>now()-interval '60 days' and coalesce(a.review_status,'') not in ('pending','en_revision','reviewing');
      if not found then continue;end if;
    else continue;end if;
    key:=md5(jsonb_build_array(event_kind,term,v_city,v_locality,v_category)::text);
    insert into public.market_metric_events(day,visit_id,event_key) values(today,p_visit,key) on conflict do nothing;
    get diagnostics added=row_count;
    if added=0 then continue;end if;
    budget:=budget+1;
    insert into public.market_daily_metrics(day,kind,city,locality,category,dimension,hits,no_results)
      values(today,event_kind,v_city,v_locality,v_category,term,1,empty_count)
      on conflict(day,kind,city,locality,category,dimension) do update
        set hits=public.market_daily_metrics.hits+1,no_results=public.market_daily_metrics.no_results+excluded.no_results;
  end loop;
end;
$$;
revoke all on function public.record_market_metrics(uuid,jsonb) from public;
grant execute on function public.record_market_metrics(uuid,jsonb) to anon,authenticated;

create or replace function public.staff_market_dashboard(p_days integer default 30,p_city text default '',p_locality text default '',p_category text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;today date:=(now() at time zone 'America/Bogota')::date;start_date date;
begin
  perform public.staff_require('team');
  if p_days is null or p_days not in (7,30,90) or p_city is null or p_locality is null or p_category is null
    or greatest(length(p_city),length(p_locality),length(p_category))>100
    or (p_locality<>'' and p_city='') then raise exception 'Filtros no validos.';end if;
  start_date:=today-p_days+1;
  -- Bounded cleanup; no scheduled functions, no background polling or raw browsing history.
  delete from public.market_metric_events where ctid in(select ctid from public.market_metric_events where day<today-1 limit 5000);
  delete from public.market_daily_metrics where ctid in(select ctid from public.market_daily_metrics where day<today-365 limit 5000);
  with metrics as materialized(select * from public.market_daily_metrics where day between start_date and today
      and (p_city='' or city=p_city) and (p_locality='' or locality=p_locality) and (p_category='' or category=p_category)),
  publications as materialized(select h.* from public.staff_publication_history h
    where (p_city='' or h.city=p_city) and (p_locality='' or h.locality=p_locality)
      and (p_category='' or h.analytics_category=p_category)),
  delivered as materialized(select * from publications where (first_delivered_at at time zone 'America/Bogota')::date between start_date and today),
  totals as(select coalesce(sum(hits) filter(where kind='search'),0) as consultations,
    coalesce(sum(hits) filter(where kind='search' and dimension<>''),0) as searches,
    coalesce(sum(no_results) filter(where kind='search' and dimension<>''),0) as no_results,
    coalesce(sum(hits) filter(where kind='view'),0) as views from metrics),
  search_rank as(select dimension as label,sum(hits) as value,sum(no_results) as no_results from metrics
    where kind='search' and dimension<>'' group by dimension order by value desc,label limit 10),
  locality_rank as(select city,locality as label,sum(hits) as value from metrics where kind='search' and locality<>''
    group by city,locality order by value desc,city,label limit 10),
  category_rank as(select category as label,sum(hits) as value from metrics where kind='search' and category<>''
    group by category order by value desc,label limit 10),
  article_rank as(select m.dimension as id,coalesce(h.title,'Publicación eliminada') as label,sum(m.hits) as value,h.deleted_at is not null as deleted
    from metrics m left join public.staff_publication_history h on h.article_id::text=m.dimension where kind='view'
    group by m.dimension,h.title,h.deleted_at order by value desc,id limit 10),
  seller_rank as(select h.owner_id as id,coalesce(u.nombre,'Cuenta no disponible') as label,count(*) as value
    from delivered h left join public.usuarios u on u.id=h.owner_id where h.mode='venta'
    group by h.owner_id,u.nombre order by value desc,h.owner_id limit 10),
  daily_events as(select day,coalesce(sum(hits) filter(where kind='search' and dimension<>''),0) as searches,
      coalesce(sum(hits) filter(where kind='view'),0) as views from metrics group by day),
  daily_sales as(select (first_delivered_at at time zone 'America/Bogota')::date as day,count(*) filter(where mode='venta') as sales from delivered group by 1),
  trend as(select d::date as day,coalesce(e.searches,0) as searches,coalesce(e.views,0) as views,coalesce(s.sales,0) as sales
    from generate_series(start_date::timestamp,today::timestamp,interval '1 day')d
    left join daily_events e on e.day=d::date left join daily_sales s on s.day=d::date order by d)
  select jsonb_build_object('started_at',(select started_at from public.market_metrics_settings where singleton),
    'generated_at',now(),'totals',(select to_jsonb(t)||jsonb_build_object(
      'sales',(select count(*) from delivered where mode='venta'),
      'donations',(select count(*) from delivered where mode='donacion'),
      'publications',(select count(*) from publications where (created_at at time zone 'America/Bogota')::date between start_date and today),
      'undated_sales',(select count(*) from publications where mode='venta' and delivered_ever and first_delivered_at is null)) from totals t),
    'trend',coalesce((select jsonb_agg(to_jsonb(t)) from trend t),'[]'),
    'searches',coalesce((select jsonb_agg(to_jsonb(r)) from search_rank r),'[]'),
    'localities',coalesce((select jsonb_agg(to_jsonb(r)) from locality_rank r),'[]'),
    'categories',coalesce((select jsonb_agg(to_jsonb(r)) from category_rank r),'[]'),
    'articles',coalesce((select jsonb_agg(to_jsonb(r)) from article_rank r),'[]'),
    'sellers',coalesce((select jsonb_agg(to_jsonb(r)) from seller_rank r),'[]')) into result;
  update public.staff_sessions set last_seen_at=now() where session_id=(auth.jwt()->>'session_id')::uuid and user_id=auth.uid();
  return result;
end;
$$;
revoke all on function public.staff_market_dashboard(integer,text,text,text) from public,anon;
grant execute on function public.staff_market_dashboard(integer,text,text,text) to authenticated;

notify pgrst,'reload schema';
commit;
