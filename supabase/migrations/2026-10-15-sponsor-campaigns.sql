begin;
alter table public.staff_accounts alter column permissions set default array['moderation','reports','users'];
with previous as materialized(select user_id,permissions from public.staff_accounts where role='admin' and 'sponsors'=any(permissions)),
changed as(update public.staff_accounts s set permissions=array_remove(s.permissions,'sponsors') from previous p where s.user_id=p.user_id returning s.user_id,s.permissions)
insert into public.staff_audit(action,target_id,reason,changes)
  select 'staff.sponsors_restricted',c.user_id,'Patrocinadores reservado al Super Admin',jsonb_build_object('before',p.permissions,'after',c.permissions)
  from changed c join previous p using(user_id);

alter table public.patrocinadores add column if not exists placement text not null default 'footer' check(placement in ('hero','footer'));
alter table public.patrocinadores add column if not exists position integer not null default 0 check(position between 0 and 999);
alter table public.patrocinadores add column if not exists mobile_image_url text not null default '';
alter table public.patrocinadores add column if not exists button_text text not null default 'Visitar sitio';
alter table public.patrocinadores add column if not exists badge text not null default 'Publicidad';
alter table public.patrocinadores add column if not exists destination text not null default 'external' check(destination in ('external','how','blog'));
alter table public.patrocinadores add column if not exists starts_at timestamptz;
alter table public.patrocinadores add column if not exists ends_at timestamptz;
alter table public.patrocinadores add column if not exists updated_at timestamptz not null default now();
alter table public.patrocinadores add column if not exists target_locations jsonb not null default '[]';
alter table public.patrocinadores add column if not exists target_categories jsonb not null default '[]';
alter table public.patrocinadores add column if not exists creative_assets jsonb not null default '[]';
create index if not exists sponsor_campaign_order_idx on public.patrocinadores(placement,activo,position,id);
revoke select on public.patrocinadores from anon,authenticated;

insert into public.patrocinadores(id,texto,descripcion,imagen_url,enlace,placement,position,badge,button_text,destination) values
 ('a1000000-0000-4000-8000-000000000001','Tu basura es el tesoro de alguien más.','Aprende a publicar, donar, vender o intercambiar.','https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?q=80&w=1600&auto=format&fit=crop','','hero',0,'Economía circular','¿Cómo funciona?','how'),
 ('a1000000-0000-4000-8000-000000000002','Anuncia tu marca en MiBatute','Conecta tu marca con una comunidad que compra, dona y reutiliza.','https://images.unsplash.com/photo-1557838923-2985c318be48?q=80&w=1600&auto=format&fit=crop','https://www.mibatute.com/terminos','hero',1,'Publicidad','Conocer más','external'),
 ('a1000000-0000-4000-8000-000000000003','Ideas reales para reciclar y reutilizar','Guías y ejemplos para darle segunda vida a tus cosas.','https://images.unsplash.com/photo-1528323273322-d81458248d40?q=80&w=1600&auto=format&fit=crop','','hero',2,'Blog y tutoriales','Ver tutoriales','blog')
on conflict(id) do nothing;

create table if not exists public.sponsor_daily_metrics(
  sponsor_id uuid not null references public.patrocinadores(id) on delete cascade,
  day date not null,placement text not null check(placement in ('hero','footer')),
  impressions bigint not null default 0,clicks bigint not null default 0,primary key(sponsor_id,day,placement)
);
create index if not exists sponsor_daily_day_idx on public.sponsor_daily_metrics(day,sponsor_id);
create table if not exists public.sponsor_visit_metrics(
  visit_id uuid not null,sponsor_id uuid not null references public.patrocinadores(id) on delete cascade,
  day date not null,placement text not null check(placement in ('hero','footer')),
  seen boolean not null default false,clicked boolean not null default false,primary key(visit_id,sponsor_id,day,placement)
);
create index if not exists sponsor_visit_day_idx on public.sponsor_visit_metrics(day);
alter table public.sponsor_daily_metrics enable row level security;
alter table public.sponsor_visit_metrics enable row level security;
revoke all on public.sponsor_daily_metrics,public.sponsor_visit_metrics from anon,authenticated;
grant all on public.sponsor_daily_metrics,public.sponsor_visit_metrics to service_role;

drop function if exists public.public_sponsor_slots();
create or replace function public.public_sponsor_slots(p_city text default '',p_locality text default '',p_category text default '',p_seed uuid default null)
returns jsonb language sql stable security definer set search_path='' as $$
  -- A bounded, seeded sample gives every eligible advertiser a chance without downloading the catalog.
  with eligible as(select p.* from public.patrocinadores p
    where activo and (starts_at is null or starts_at<=now()) and (ends_at is null or ends_at>now())
      and (target_categories='[]' or target_categories ? left(coalesce(p_category,''),100))
      and (target_locations='[]' or exists(select 1 from jsonb_array_elements(target_locations) z
        where z->>'city'=left(coalesce(p_city,''),100) and (coalesce(z->>'locality','')='' or z->>'locality'=left(coalesce(p_locality,''),100))))),
  sampled as(select p.*,row_number() over(partition by placement order by md5(id::text||coalesce(p_seed::text,''))) as slot_number from eligible p)
  select coalesce(jsonb_agg(to_jsonb(r)),'[]') from(
    select id,texto,descripcion,imagen_url,mobile_image_url,creative_assets,enlace,placement,position,badge,button_text,destination
    from sampled where slot_number<=6 order by placement,position,slot_number
  )r;
$$;
revoke all on function public.public_sponsor_slots(text,text,text,uuid) from public;
grant execute on function public.public_sponsor_slots(text,text,text,uuid) to anon,authenticated;

create or replace function public.record_sponsor_metrics(p_visit uuid,p_events jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare event jsonb;ad public.patrocinadores%rowtype;previous public.sponsor_visit_metrics%rowtype;
  today date:=(now() at time zone 'America/Bogota')::date;v_seen boolean;v_clicked boolean;views integer;v_clicks integer;
begin
  if p_visit is null or jsonb_typeof(p_events) is distinct from 'array' or jsonb_array_length(p_events)>20 then raise exception 'Lote no valido.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_visit::text,20261016));
  for event in select value from jsonb_array_elements(p_events) order by value->>'id' loop
    if event->>'placement' not in ('hero','footer') or jsonb_typeof(event->'seen') is distinct from 'boolean'
      or jsonb_typeof(event->'clicked') is distinct from 'boolean' then raise exception 'Evento no valido.'; end if;
    select * into ad from public.patrocinadores where id=(event->>'id')::uuid and activo
      and placement=event->>'placement' and (starts_at is null or starts_at<=now()) and (ends_at is null or ends_at>now()) for key share;
    if not found then continue; end if;
    v_clicked:=(event->>'clicked')::boolean;v_seen:=(event->>'seen')::boolean or v_clicked;
    if not v_seen then continue; end if;
    insert into public.sponsor_visit_metrics(visit_id,sponsor_id,day,placement) values(p_visit,ad.id,today,ad.placement) on conflict do nothing;
    select * into previous from public.sponsor_visit_metrics where visit_id=p_visit and sponsor_id=ad.id and day=today and placement=ad.placement for update;
    views:=case when v_seen and not previous.seen then 1 else 0 end;
    v_clicks:=case when v_clicked and not previous.clicked then 1 else 0 end;
    if views=0 and v_clicks=0 then continue; end if;
    update public.sponsor_visit_metrics set seen=previous.seen or v_seen,clicked=previous.clicked or v_clicked
      where visit_id=p_visit and sponsor_id=ad.id and day=today and placement=ad.placement;
    insert into public.sponsor_daily_metrics(sponsor_id,day,placement,impressions,clicks) values(ad.id,today,ad.placement,views,v_clicks)
      on conflict(sponsor_id,day,placement) do update set impressions=public.sponsor_daily_metrics.impressions+excluded.impressions,clicks=public.sponsor_daily_metrics.clicks+excluded.clicks;
    update public.patrocinadores set impresiones=impresiones+views,clics=clics+v_clicks where id=ad.id;
  end loop;
end;
$$;
revoke all on function public.record_sponsor_metrics(uuid,jsonb) from public;
grant execute on function public.record_sponsor_metrics(uuid,jsonb) to anon,authenticated;

create or replace function public.staff_sponsor_dashboard(p_search text default '',p_page integer default 1,p_days integer default 30,p_placement text default '',p_state text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;page integer:=greatest(1,coalesce(p_page,1));total integer;today date:=(now() at time zone 'America/Bogota')::date;
begin
  perform public.staff_require('sponsors');
  if p_days not in (7,30,90) or p_days is null or p_placement not in ('','hero','footer') or p_state not in ('','active','paused','scheduled','expired') then raise exception 'Filtros no validos.'; end if;
  -- Raw per-page identifiers expire; daily aggregates remain available.
  delete from public.sponsor_visit_metrics where ctid in(select ctid from public.sponsor_visit_metrics where day<today-30 limit 5000);
  with campaigns as(select p.*,case when not activo then 'paused' when starts_at>now() then 'scheduled' when ends_at<=now() then 'expired' else 'active' end as campaign_state
    from public.patrocinadores p where position(lower(left(trim(coalesce(p_search,'')),100)) in lower(texto))>0 and (p_placement='' or placement=p_placement))
    select count(*) into total from campaigns where p_state='' or campaign_state=p_state;
  page:=least(page,greatest(1,ceil(total/20.0)::integer));
  with campaigns as(select p.*,case when not activo then 'paused' when starts_at>now() then 'scheduled' when ends_at<=now() then 'expired' else 'active' end as campaign_state
      from public.patrocinadores p where position(lower(left(trim(coalesce(p_search,'')),100)) in lower(texto))>0 and (p_placement='' or placement=p_placement)),
  filtered as(select * from campaigns where p_state='' or campaign_state=p_state),
  totals as(select coalesce(sum(m.impressions),0) as impressions,coalesce(sum(m.clicks),0) as clicks from public.sponsor_daily_metrics m join filtered p on p.id=m.sponsor_id where m.day between today-p_days+1 and today and (p_placement='' or m.placement=p_placement)),
  paged as(select p.*,coalesce(m.impressions,0) as period_impressions,coalesce(m.clicks,0) as period_clicks from filtered p
    left join lateral(select sum(impressions) as impressions,sum(clicks) as clicks from public.sponsor_daily_metrics where sponsor_id=p.id and day between today-p_days+1 and today and (p_placement='' or placement=p_placement))m on true
    order by placement,position,created_at desc,id limit 20 offset(page-1)*20),
  trend as(select d::date as day,coalesce(sum(m.impressions),0) as impressions,coalesce(sum(m.clicks),0) as clicks
    from generate_series((today-p_days+1)::timestamp,today::timestamp,interval '1 day')d
    left join public.sponsor_daily_metrics m on m.day=d::date and m.sponsor_id in(select id from filtered) and (p_placement='' or m.placement=p_placement) group by d order by d)
  select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(p)) from paged p),'[]'),
    'totals',(select to_jsonb(t) from totals t),'trend',(select jsonb_agg(to_jsonb(t)) from trend t),
    'active',(select count(*) from filtered where campaign_state='active'),'total',total,'page',page,'pageCount',greatest(1,ceil(total/20.0)::integer)) into result;
  return result;
end;
$$;
revoke all on function public.staff_sponsor_dashboard(text,integer,integer,text,text) from public,anon;
grant execute on function public.staff_sponsor_dashboard(text,integer,integer,text,text) to authenticated;

drop function if exists public.staff_save_sponsor(uuid,jsonb,text,timestamptz);
create or replace function public.staff_save_sponsor(p_id uuid,p_data jsonb,p_version timestamptz default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare previous public.patrocinadores%rowtype;target uuid:=coalesce(p_id,gen_random_uuid());
  title text:=trim(coalesce(p_data->>'texto',''));image text:=trim(coalesce(p_data->>'imagen_url',''));mobile text:=trim(coalesce(p_data->>'mobile_image_url',''));
  link text:=trim(coalesce(p_data->>'enlace',''));slot text:=p_data->>'placement';destination text:=p_data->>'destination';
  start_at timestamptz:=nullif(p_data->>'starts_at','')::timestamptz;end_at timestamptz:=nullif(p_data->>'ends_at','')::timestamptz;
  url_pattern text:='^https://[a-zA-Z0-9][a-zA-Z0-9.-]*(:[0-9]{1,5})?([/?#][^[:space:]<>]*)?$';
  zones jsonb:=coalesce(p_data->'target_locations','[]');categories jsonb:=coalesce(p_data->'target_categories','[]');assets jsonb:=coalesce(p_data->'creative_assets','[]');item jsonb;
begin
  perform public.staff_require('sponsors');
  if jsonb_typeof(zones) is distinct from 'array' or jsonb_typeof(categories) is distinct from 'array' or jsonb_typeof(assets) is distinct from 'array' then raise exception 'Segmentacion o imagenes no validas.'; end if;
  if jsonb_array_length(zones)>100 or jsonb_array_length(categories)>20 or jsonb_array_length(assets)>12 then raise exception 'Maximo 100 zonas, 20 categorias y 12 imagenes por campana.'; end if;
  for item in select value from jsonb_array_elements(zones) loop
    if jsonb_typeof(item) is distinct from 'object' or jsonb_typeof(item->'city') is distinct from 'string'
      or length(trim(item->>'city')) not between 1 and 100 or item->>'city'<>trim(item->>'city')
      or jsonb_typeof(item->'locality') is distinct from 'string' or length(item->>'locality')>100 or item->>'locality'<>trim(item->>'locality') then raise exception 'Zona no valida.'; end if;
  end loop;
  for item in select value from jsonb_array_elements(categories) loop
    if jsonb_typeof(item) is distinct from 'string' or length(trim(item#>>'{}')) not between 1 and 100 or item#>>'{}'<>trim(item#>>'{}') then raise exception 'Categoria no valida.'; end if;
  end loop;
  for item in select value from jsonb_array_elements(assets) loop
    if jsonb_typeof(item) is distinct from 'object' or jsonb_typeof(item->'imagen_url') is distinct from 'string'
      or length(item->>'imagen_url')>2048 or ((item->>'imagen_url')!~url_pattern and (item->>'imagen_url')!~'^http://(127[.]0[.]0[.]1|localhost)(:[0-9]+)?/[^[:space:]<>]*$')
      or jsonb_typeof(item->'mobile_image_url') is distinct from 'string' or length(item->>'mobile_image_url')>2048
      or (item->>'mobile_image_url'<>'' and (item->>'mobile_image_url')!~url_pattern and (item->>'mobile_image_url')!~'^http://(127[.]0[.]0[.]1|localhost)(:[0-9]+)?/[^[:space:]<>]*$') then raise exception 'Imagen de galeria no valida.'; end if;
  end loop;
  if length(title) not between 2 and 100 or length(coalesce(p_data->>'descripcion',''))>250 or slot not in ('hero','footer') or slot is null
    or destination not in ('external','how','blog') or destination is null or (slot='footer' and destination<>'external')
    or length(coalesce(p_data->>'button_text','')) not between 1 and 40 or length(coalesce(p_data->>'badge',''))>40
    or coalesce((p_data->>'position')::integer,-1) not between 0 and 999 then raise exception 'Revisa los datos de la campana.'; end if;
  if length(image)>2048 or length(mobile)>2048 or length(link)>2048 then raise exception 'Las direcciones no pueden superar 2048 caracteres.'; end if;
  if image!~url_pattern and image!~'^http://(127[.]0[.]0[.]1|localhost)(:[0-9]+)?/[^[:space:]<>]*$' then raise exception 'La imagen debe usar una URL HTTPS.'; end if;
  if mobile<>'' and mobile!~url_pattern and mobile!~'^http://(127[.]0[.]0[.]1|localhost)(:[0-9]+)?/[^[:space:]<>]*$' then raise exception 'La imagen movil no es valida.'; end if;
  if destination='external' and link!~url_pattern then raise exception 'El enlace debe usar HTTPS y no contener credenciales.'; end if;
  if end_at is not null and start_at is not null and end_at<=start_at then raise exception 'El fin debe ser posterior al inicio.'; end if;
  if p_id is not null then
    select * into previous from public.patrocinadores where id=p_id for update;
    if not found then raise exception 'La campana ya no existe.'; end if;
    if p_version is distinct from previous.updated_at then raise exception 'La campana cambio. Cierra y vuelve a abrir la edicion.'; end if;
  end if;
  insert into public.patrocinadores(id,texto,descripcion,imagen_url,mobile_image_url,enlace,activo,placement,position,badge,button_text,destination,starts_at,ends_at,updated_at,target_locations,target_categories,creative_assets)
    values(target,title,p_data->>'descripcion',image,mobile,case when destination='external' then link else '' end,coalesce((p_data->>'activo')::boolean,false),slot,
      (p_data->>'position')::integer,p_data->>'badge',p_data->>'button_text',destination,start_at,end_at,clock_timestamp(),zones,categories,assets)
    on conflict(id) do update set texto=excluded.texto,descripcion=excluded.descripcion,imagen_url=excluded.imagen_url,mobile_image_url=excluded.mobile_image_url,
      enlace=excluded.enlace,activo=excluded.activo,placement=excluded.placement,position=excluded.position,badge=excluded.badge,button_text=excluded.button_text,
      destination=excluded.destination,starts_at=excluded.starts_at,ends_at=excluded.ends_at,updated_at=excluded.updated_at,
      target_locations=excluded.target_locations,target_categories=excluded.target_categories,creative_assets=excluded.creative_assets;
  insert into public.staff_audit(actor_id,action,target_id,reason,changes) values(auth.uid(),'sponsor.save',target,
    case when p_id is null then 'Creacion de campana por Super Admin'
      when previous.activo is distinct from coalesce((p_data->>'activo')::boolean,false) then
        case when coalesce((p_data->>'activo')::boolean,false) then 'Activacion de campana por Super Admin' else 'Pausa de campana por Super Admin' end
      else 'Edicion de campana por Super Admin' end,
    jsonb_build_object('before',to_jsonb(previous),'after',(select to_jsonb(p) from public.patrocinadores p where id=target)));
  return target;
end;
$$;
revoke all on function public.staff_save_sponsor(uuid,jsonb,timestamptz) from public,anon;
grant execute on function public.staff_save_sponsor(uuid,jsonb,timestamptz) to authenticated;

do $$ declare fn regprocedure;
begin
  for fn in select oid::regprocedure from pg_proc where pronamespace='public'::regnamespace and proname in ('reg_impresion','reg_clic') loop
    execute format('revoke all on function %s from public,anon,authenticated',fn);
  end loop;
end;$$;
notify pgrst,'reload schema';
commit;
