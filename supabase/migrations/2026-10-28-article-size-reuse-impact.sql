begin;
alter table public.articulos add column if not exists size_class text
 check (size_class in ('pequeno','mediano','grande'));
alter table public.articulos add column if not exists impact_counted_at timestamptz;

-- Anonymous aggregate only; no backfill, personal data or extra realtime channels.
create table if not exists public.market_impact_totals (
 singleton boolean primary key default true check(singleton),
 reused_articles bigint not null default 0 check(reused_articles>=0),
 started_at timestamptz not null default now()
);
insert into public.market_impact_totals(singleton) values(true) on conflict do nothing;
alter table public.market_impact_totals enable row level security;
revoke all on public.market_impact_totals from public,anon,authenticated;

create or replace function public.market_reuse_impact() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('articles',reused_articles,'since',started_at)
 from public.market_impact_totals where singleton;
$$;
revoke all on function public.market_reuse_impact() from public;
grant execute on function public.market_reuse_impact() to anon,authenticated;

create or replace function public.record_reused_article() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then new.impact_counted_at:=null;return new;end if;
 -- Clients cannot erase or forge the single-use marker.
 new.impact_counted_at:=old.impact_counted_at;
 if old.impact_counted_at is null and old.status is distinct from 'entregado'
   and new.status='entregado' and new.estado='entregado'
   and new.delivered_at is not null and new.mode in ('venta','donacion') then
  update public.market_impact_totals set reused_articles=reused_articles+1 where singleton;
  new.impact_counted_at:=clock_timestamp();
 end if;
 return new;
end $$;
revoke all on function public.record_reused_article() from public,anon,authenticated;
drop trigger if exists record_reused_article on public.articulos;
create trigger record_reused_article before insert or update on public.articulos
 for each row execute function public.record_reused_article();

create or replace function public.publish_article_with_credit(p_article jsonb,p_request_id uuid,p_use_credit boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); a public.articulos%rowtype; s jsonb; charge integer:=0; balance integer; urls text[]; display_name text;
begin
  if uid is null then raise exception 'Debes iniciar sesion.' using errcode='42501'; end if;
  if p_request_id is null or jsonb_typeof(p_article) is distinct from 'object' then raise exception 'Publicacion invalida.'; end if;
  if not exists(select 1 from auth.users where id=uid and email_confirmed_at is not null)
    or exists(select 1 from public.usuarios where id=uid and (is_blocked or bloqueado)) then
    raise exception 'Debes verificar tu cuenta y tenerla habilitada para publicar.' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,1313));
  if exists(select 1 from public.article_publication_credits where article_id=p_request_id) then
    if not exists(select 1 from public.article_publication_credits where article_id=p_request_id and usuario_id=uid) then
      raise exception 'Identificador de publicacion no disponible.' using errcode='42501';
    end if;
    select * into a from public.articulos where id=p_request_id and owner_id=uid;
    if not found then raise exception 'Esta publicacion ya fue eliminada. Inicia una publicacion nueva.'; end if;
    return jsonb_build_object('success',true,'article',to_jsonb(a),'alreadyExists',true,'cost',0,
      'balance',(select saldo from public.cupos where usuario_id=uid));
  end if;
  if p_article->>'mode' not in ('venta','donacion') or nullif(trim(p_article->>'mode'),'') is null then raise exception 'Tipo de publicacion invalido.'; end if;
  if length(trim(coalesce(p_article->>'title','')))=0 then raise exception 'Escribe un titulo.'; end if;
  if nullif(trim(p_article->>'city'),'') is null or nullif(trim(p_article->>'locality'),'') is null
    or nullif(trim(p_article->>'category'),'') is null or nullif(trim(p_article->>'subcategory'),'') is null then
    raise exception 'Completa ubicacion y categoria.';
  end if;
  if p_article->>'mode'='venta' and (coalesce((p_article->>'price')::numeric,0)<=0 or (p_article->>'price')::numeric>500000) then
    raise exception 'El precio de venta debe estar entre 1 y 500000 COP.';
  end if;
  select array_agg(value order by ordinality) into urls from jsonb_array_elements_text(p_article->'imagenes') with ordinality;
  if coalesce(array_length(urls,1),0) not between 1 and 4 or exists(select 1 from unnest(urls) u where u is null or u !~ '^https?://') then
    raise exception 'Agrega entre 1 y 4 imagenes validas.';
  end if;
  s:=public.sale_publication_status(); balance:=(s->>'balance')::integer;
  if p_article->>'mode'='venta' and (s->>'requiresCredit')::boolean then
    if not coalesce(p_use_credit,false) then return s||jsonb_build_object('success',false,'code','PUBLICATION_CREDIT_REQUIRED',
      'error','Ya tienes 3 ventas activas. Confirma el uso de 1 credito para publicar otra.'); end if;
    update public.cupos set saldo=saldo-1,updated_at=now() where usuario_id=uid and saldo>=1 returning saldo into balance;
    if not found then return s||jsonb_build_object('success',false,'balance',0,'code','INSUFFICIENT_CREDITS','error','No tienes creditos suficientes para otra venta. Finaliza una venta para liberar un espacio gratuito.'); end if;
    charge:=1;
  end if;
  select nombre into display_name from public.usuarios where id=uid;
  insert into public.article_publication_credits(article_id,usuario_id,cost,publication_ready) values(p_request_id,uid,charge,true);
  insert into public.articulos(id,owner_id,owner_name,title,description,mode,price,city,locality,category,subcategory,subcategoria,
    estado_producto,size_class,status,estado,imagenes,image_url,imagen_url,imagen_url_principal,is_featured)
  values(p_request_id,uid,coalesce(nullif(display_name,''),'Usuario'),trim(p_article->>'title'),coalesce(p_article->>'description',''),p_article->>'mode',
    case when p_article->>'mode'='venta' then (p_article->>'price')::numeric else 0 end,
    p_article->>'city',p_article->>'locality',p_article->>'category',p_article->>'subcategory',p_article->>'subcategory',
    greatest(1,least(10,coalesce((p_article->>'estado_producto')::integer,8))),nullif(p_article->>'size_class',''),'disponible','disponible',urls,urls[1],urls[1],urls[1],false) returning * into a;
  if charge=1 then insert into public.cupos_historial(usuario_id,cantidad,concepto,referencia_id) values(uid,-1,'publicacion_venta',a.id); end if;
  return jsonb_build_object('success',true,'article',to_jsonb(a),'alreadyExists',false,'cost',charge,'balance',balance);
end;
$$;
revoke all on function public.publish_article_with_credit(jsonb,uuid,boolean) from public,anon;
grant execute on function public.publish_article_with_credit(jsonb,uuid,boolean) to authenticated;

create or replace function public.home_article_page(p_filters jsonb default '{}', p_page integer default 1)
returns jsonb language sql stable security invoker set search_path = public as $$
  with search as (
    select trim(regexp_replace(coalesce(p_filters->>'search', ''), '\s+', ' ', 'g')) as text,
      least(10, greatest(0, coalesce((p_filters->>'minCondition')::integer, 0))) as min_condition
  ), prefix_search as (
    select s.text, s.min_condition,
      -- Serialize parsed lexemes with PostgreSQL's escaping; raw input never becomes tsquery syntax.
      coalesce((select string_agg(array_to_tsvector(array[lexeme])::text || ':*', ' & ' order by lexeme)::tsquery
        from unnest(tsvector_to_array(to_tsvector('public.article_search'::regconfig, s.text))) as words(lexeme)),
        ''::tsquery) as query
    from search s
  ), effective_search as (
    select s.text, s.min_condition, s.query as direct_query,
      case when p_filters->>'searchMode' = 'related'
        then public.article_related_prefix_query(s.text) else s.query end as query
    from prefix_search s
  ), normalized as (
    select a.id, a.created_at, a.is_featured,
      a.home_search_document @@ s.direct_query as direct_match,
      coalesce(a.usuario_id, a.owner_id) = auth.uid() as own,
      case lower(trim(coalesce(nullif(a.estado, ''), a.status, 'disponible')))
        when 'available' then 'disponible' when 'reserved' then 'reservado'
        when 'delivered' then 'entregado'
        else lower(trim(coalesce(nullif(a.estado, ''), a.status, 'disponible'))) end as state,
      case when lower(a.mode) like '%don%' or lower(a.mode) like '%regal%' then 'donacion'
        when lower(a.mode) like '%venta%' then 'venta' else lower(trim(a.mode)) end as kind,
      lower(trim(coalesce(a.category, a.categoria, ''))) as category,
      lower(trim(coalesce(a.subcategory, a.subcategoria, ''))) as subcategory
    from public.articulos a cross join effective_search s
    where a.created_at > now() - interval '1440 hours'
      and (s.min_condition = 0 or a.estado_producto >= s.min_condition)
      and a.city = coalesce(p_filters->>'city', 'Bogotá')
      and (coalesce(p_filters->>'locality', 'Todas') = 'Todas' or a.locality = p_filters->>'locality')
      and (s.text = '' or a.home_search_document @@ s.query)
  ), filtered as materialized (
    select * from normalized
    where not (coalesce((p_filters->>'hideOwn')::boolean, false) and coalesce(own, false))
      and state not in ('pausado', 'entregado')
      and (not coalesce((p_filters->>'onlyActive')::boolean, true) or state <> 'reservado')
      and (coalesce(p_filters->>'kind', 'todo') = 'todo'
        or (p_filters->>'kind' = 'destacado' and is_featured)
        or kind = p_filters->>'kind')
      and (coalesce(p_filters->>'category', 'Todo') = 'Todo' or category = lower(trim(p_filters->>'category')))
      and (coalesce(p_filters->>'subcategory', '') = '' or subcategory = lower(trim(p_filters->>'subcategory')))
  ), ranked as (
    select id, is_featured, row_number() over (
      order by
        direct_match desc,
        case when coalesce(p_filters->>'sort', 'random') = 'random'
          then md5(id::text || coalesce(p_filters->>'featuredSeed', '')) end,
        case when p_filters->>'sort' = 'oldest' then created_at end asc,
        case when p_filters->>'sort' = 'newest' then created_at end desc,
        id
    ) as base_position
    from filtered
  ), grouped as (
    select id, coalesce(is_featured, false) as is_featured,
      row_number() over (partition by coalesce(is_featured, false) order by base_position) as group_position
    from ranked
  ), ordered as (
    -- Interleave globally before paginating: one featured, then six normal articles.
    select id, row_number() over (
      order by case when is_featured then (group_position - 1) * 7
        else group_position + (group_position - 1) / 6 end, id
    ) as position,
      -- A mobile block is a full-width feature or a pair of normal articles.
      dense_rank() over (
        order by case when is_featured then (group_position - 1) * 4
          else (group_position + 1) / 2 + (group_position - 1) / 6 end
      ) as block_position
    from grouped
  ), counts as (
    select count(*) as total,
      greatest(1, case when p_filters->>'layout' = 'mobile'
        then ceil(coalesce(max(block_position), 0) / 4.0)::integer
        else ceil(count(*) / (case when p_filters->>'desktopPageSize' = '12' then 12.0 else 9.0 end))::integer end) as page_count
    from ordered
  ), totals as (
    select total, page_count,
      least(greatest(coalesce(p_page, 1), 1), page_count) as page from counts
  ), page_ids as (
    select id, position from ordered
    where case when p_filters->>'layout' = 'mobile' then (block_position - 1) / 4 + 1
      else (position - 1) / (case when p_filters->>'desktopPageSize' = '12' then 12 else 9 end) + 1 end = (select page from totals)
    order by position
  ), featured_ids as (
    select id from filtered where is_featured
    order by md5(id::text || coalesce(p_filters->>'featuredSeed', '')) limit 12
  )
  select jsonb_build_object('reuseImpact', public.market_reuse_impact(), 'total', total, 'page', page, 'pageCount', page_count,
    'ids', coalesce((select jsonb_agg(id order by position) from page_ids), '[]'::jsonb),
    'featuredIds', coalesce((select jsonb_agg(id) from featured_ids), '[]'::jsonb)) from totals;
$$;
revoke all on function public.home_article_page(jsonb, integer) from public;
grant execute on function public.home_article_page(jsonb, integer) to anon, authenticated;

create or replace function public.owner_save_article_photo_order(p_article_id uuid,p_order uuid[],p_fields jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); a public.articulos%rowtype; urls text[]; photos jsonb; total integer;
begin
 if uid is null then raise exception 'Inicia sesión.' using errcode='42501';end if;
 select * into a from public.articulos where id=p_article_id for update;
 if not found or a.owner_id is distinct from uid then raise exception 'Solo puedes ordenar las fotos de tus publicaciones.' using errcode='42501';end if;
 if coalesce(nullif(a.estado,''),a.status,'') not in('disponible','pausado') then raise exception 'Solo puedes editar una publicación disponible o pausada.';end if;
 if exists(select 1 from public.usuarios where id=uid and (is_blocked or bloqueado)) then raise exception 'Tu cuenta está bloqueada.' using errcode='42501';end if;
 if coalesce(cardinality(p_order),0) not between 1 and 4 or array_position(p_order,null) is not null
   or (select count(distinct value) from unnest(p_order) value)<>cardinality(p_order) then raise exception 'El orden de fotos no es válido.';end if;
 perform 1 from public.articulo_imagenes where articulo_id=a.id order by id for update;
 select count(*) into total from public.articulo_imagenes where articulo_id=a.id;
 if total<>cardinality(p_order) or (select count(*) from public.articulo_imagenes where articulo_id=a.id and id=any(p_order))<>total then
   raise exception 'Las fotos cambiaron. Actualiza la publicación antes de guardar el orden.';
 end if;
 if p_fields is not null then
   if jsonb_typeof(p_fields)<>'object' then raise exception 'Datos de publicación inválidos.';end if;
   if nullif(trim(p_fields->>'title'),'') is null or nullif(trim(p_fields->>'category'),'') is null
     or nullif(trim(p_fields->>'subcategory'),'') is null or nullif(trim(p_fields->>'city'),'') is null
     or nullif(trim(p_fields->>'locality'),'') is null then raise exception 'Completa título, categoría y ubicación.';end if;
   if a.mode='venta' and (coalesce((p_fields->>'price')::numeric,0)<=0 or (p_fields->>'price')::numeric>500000) then raise exception 'El precio debe estar entre 1 y 500000 COP.';end if;
   if (p_fields->>'estado_producto') is not null and (p_fields->>'estado_producto')::integer not between 1 and 10 then raise exception 'Estado del artículo inválido.';end if;
 end if;
 update public.articulo_imagenes i set position=ordered.position::integer-1
   from unnest(p_order) with ordinality ordered(id,position) where i.id=ordered.id and i.articulo_id=a.id;
 select array_agg(url order by position,id),jsonb_agg(to_jsonb(i) order by position,id) into urls,photos from public.articulo_imagenes i where articulo_id=a.id;
 update public.articulos set imagenes=urls,image_url=urls[1],imagen_url=urls[1],imagen_url_principal=urls[1],updated_at=now(),
   title=case when p_fields is null then a.title else trim(p_fields->>'title') end,
   titulo=case when p_fields is null then a.titulo else trim(p_fields->>'title') end,
   description=case when p_fields is null then a.description else coalesce(p_fields->>'description','') end,
   category=case when p_fields is null then a.category else p_fields->>'category' end,
   categoria=case when p_fields is null then a.categoria else p_fields->>'category' end,
   subcategory=case when p_fields is null then a.subcategory else p_fields->>'subcategory' end,
   subcategoria=case when p_fields is null then a.subcategoria else p_fields->>'subcategory' end,
   city=case when p_fields is null then a.city else p_fields->>'city' end,
   locality=case when p_fields is null then a.locality else p_fields->>'locality' end,
   price=case when p_fields is null then a.price when a.mode='venta' then (p_fields->>'price')::numeric else 0 end,
   size_class=case when p_fields is null or not(p_fields ? 'size_class') then a.size_class else nullif(p_fields->>'size_class','') end,
   estado_producto=case when p_fields is null then a.estado_producto else coalesce((p_fields->>'estado_producto')::integer,a.estado_producto) end
 where id=a.id returning * into a;
 return to_jsonb(a)||jsonb_build_object('articulo_imagenes',photos,'images',photos);
end;
$$;
revoke all on function public.owner_save_article_photo_order(uuid,uuid[],jsonb) from public,anon;
grant execute on function public.owner_save_article_photo_order(uuid,uuid[],jsonb) to authenticated;

create or replace function public.staff_article_preview(p_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; content jsonb;
begin
  perform public.staff_require('access');
  if not (public.staff_permission('moderation') or public.staff_permission('reports')) then
    raise exception 'Acceso no autorizado.' using errcode='42501';
  end if;
  content:=public.staff_article_content(p_id);
  if content is null then raise exception 'La publicación ya no existe.';end if;
  select jsonb_build_object('id',a.id,'title',a.title,'description',a.description,'mode',a.mode,'price',a.price,
    'status',a.status,'estado',a.status,'review_status',a.review_status,'city',a.city,'locality',a.locality,
    'category',coalesce(a.category,a.categoria),'subcategory',coalesce(to_jsonb(a)->>'subcategory',to_jsonb(a)->>'subcategoria'),
    'size_class',a.size_class,'estado_producto',to_jsonb(a)->'estado_producto','is_featured',to_jsonb(a)->'is_featured',
    'image_url',content->'images'->>0,'imagenes',content->'images','created_at',a.created_at,
    'owner_id',a.owner_id,'owner_name',u.nombre,'owner_photo',u.foto_url,
    'owner_reputation',(select jsonb_build_object('promedio',coalesce(round(avg(r.estrellas),1),0),'total',count(*)) from public.reputacion r where r.reviewed_id=a.owner_id))
    into result from public.articulos a left join public.usuarios u on u.id=a.owner_id where a.id=p_id;
  return result;
end;
$$;
revoke all on function public.staff_article_preview(uuid) from public,anon;
grant execute on function public.staff_article_preview(uuid) to authenticated;

notify pgrst,'reload schema';
commit;
