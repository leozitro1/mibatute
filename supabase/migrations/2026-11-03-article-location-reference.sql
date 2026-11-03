begin;
alter table public.articulos add column if not exists location_reference text not null default ''
 check (char_length(location_reference)<=100);

-- Recompute the existing stored search document and its GIN index in place (PostgreSQL 17).
-- Existing articles retain an empty reference; all reads/searches keep their current APIs.
alter table public.articulos alter column home_search_document set expression as (
 to_tsvector('public.article_search'::regconfig,
  coalesce(title,'') || ' ' || coalesce(titulo,'') || ' ' || coalesce(description,'') || ' ' ||
  coalesce(category,'') || ' ' || coalesce(categoria,'') || ' ' ||
  coalesce(subcategory,'') || ' ' || coalesce(subcategoria,'') || ' ' ||
  coalesce(city,'') || ' ' || coalesce(locality,'') || ' ' || coalesce(location_reference,''))
);

create or replace function public.guard_publication_text() returns trigger
language plpgsql security definer set search_path='' as $$
declare field text;problem text;value text;before_value jsonb:=case when tg_op='UPDATE' then to_jsonb(old) else '{}'::jsonb end;
begin
 new.location_reference:=trim(regexp_replace(coalesce(new.location_reference,''),'[[:space:]]+',' ','g'));
 if length(new.location_reference)>100 then raise exception 'La referencia de ubicación debe tener máximo 100 caracteres.' using errcode='23514';end if;
 foreach field in array array['title','titulo','description','descripcion','location_reference'] loop
  value:=to_jsonb(new)->>field;
  if value is null or (tg_op='UPDATE' and value is not distinct from before_value->>field) then continue;end if;
  if field in ('title','titulo') and length(value)>160 then raise exception 'El título debe tener máximo 160 caracteres.' using errcode='23514';end if;
  problem:=public.publication_text_problem(value);
  if problem is not null then raise exception '%',problem using errcode='23514';end if;
 end loop;
 return new;
end $$;

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
      'error',format('Alcanzaste tus %s ventas gratuitas. Confirma el uso de 1 credito para publicar otra.',s->>'freeLimit')); end if;
    update public.cupos set saldo=saldo-1,updated_at=now() where usuario_id=uid and saldo>=1 returning saldo into balance;
    if not found then return s||jsonb_build_object('success',false,'balance',0,'code','INSUFFICIENT_CREDITS','error','No tienes creditos suficientes para otra venta. Finaliza una venta para liberar un espacio gratuito.'); end if;
    charge:=1;
  end if;
  select nombre into display_name from public.usuarios where id=uid;
  insert into public.article_publication_credits(article_id,usuario_id,cost,publication_ready) values(p_request_id,uid,charge,true);
  insert into public.articulos(id,owner_id,owner_name,title,description,mode,price,city,locality,category,subcategory,subcategoria,
    estado_producto,size_class,location_reference,status,estado,imagenes,image_url,imagen_url,imagen_url_principal,is_featured)
  values(p_request_id,uid,coalesce(nullif(display_name,''),'Usuario'),trim(p_article->>'title'),coalesce(p_article->>'description',''),p_article->>'mode',
    case when p_article->>'mode'='venta' then (p_article->>'price')::numeric else 0 end,
    p_article->>'city',p_article->>'locality',p_article->>'category',p_article->>'subcategory',p_article->>'subcategory',
    greatest(1,least(10,coalesce((p_article->>'estado_producto')::integer,8))),nullif(p_article->>'size_class',''),coalesce(p_article->>'location_reference',''),'disponible','disponible',urls,urls[1],urls[1],urls[1],false) returning * into a;
  if charge=1 then insert into public.cupos_historial(usuario_id,cantidad,concepto,referencia_id) values(uid,-1,'publicacion_venta',a.id); end if;
  return jsonb_build_object('success',true,'article',to_jsonb(a),'alreadyExists',false,'cost',charge,'balance',balance);
end;
$$;

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
   location_reference=case when p_fields is null or not(p_fields ? 'location_reference') then a.location_reference else coalesce(p_fields->>'location_reference','') end,
   price=case when p_fields is null then a.price when a.mode='venta' then (p_fields->>'price')::numeric else 0 end,
   size_class=case when p_fields is null or not(p_fields ? 'size_class') then a.size_class else nullif(p_fields->>'size_class','') end,
   estado_producto=case when p_fields is null then a.estado_producto else coalesce((p_fields->>'estado_producto')::integer,a.estado_producto) end
 where id=a.id returning * into a;
 return to_jsonb(a)||jsonb_build_object('articulo_imagenes',photos,'images',photos);
end;
$$;

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
    'location_reference',a.location_reference,'size_class',a.size_class,'estado_producto',to_jsonb(a)->'estado_producto','is_featured',to_jsonb(a)->'is_featured',
    'image_url',content->'images'->>0,'imagenes',content->'images','created_at',a.created_at,
    'owner_id',a.owner_id,'owner_name',u.nombre,'owner_photo',u.foto_url,
    'owner_reputation',(select jsonb_build_object('promedio',coalesce(round(avg(r.estrellas),1),0),'total',count(*)) from public.reputacion r where r.reviewed_id=a.owner_id))
    into result from public.articulos a left join public.usuarios u on u.id=a.owner_id where a.id=p_id;
  return result;
end;
$$;

notify pgrst,'reload schema';
commit;
