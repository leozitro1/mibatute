begin;
-- Save the full order, cover aliases and optional article edits atomically.
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
   estado_producto=case when p_fields is null then a.estado_producto else coalesce((p_fields->>'estado_producto')::integer,a.estado_producto) end
 where id=a.id returning * into a;
 return to_jsonb(a)||jsonb_build_object('articulo_imagenes',photos,'images',photos);
end;
$$;
revoke all on function public.owner_save_article_photo_order(uuid,uuid[],jsonb) from public,anon;
grant execute on function public.owner_save_article_photo_order(uuid,uuid[],jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
