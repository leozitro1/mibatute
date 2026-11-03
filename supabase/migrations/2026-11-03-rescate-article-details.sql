begin;
create or replace function public.my_rescue_applications()
returns setof jsonb language sql stable security invoker set search_path = public as $$
  with applications as (
    select id,articulo_id,created_at,justificacion,false as rejected from public.postulaciones where usuario_id = auth.uid()
    union all
    select id,articulo_id,created_at,null::text,true from public.postulaciones_rechazadas
      where usuario_id = auth.uid() and created_at > now() - interval '24 hours'
  )
  select jsonb_build_object('id',p.id,'articulo_id',p.articulo_id,'created_at',p.created_at,
    'justificacion',p.justificacion,'_source',case when p.rejected then 'rechazadas' else 'postulaciones' end,
    '_rejectedAt',case when p.rejected then p.created_at else null end,
    'articulo',to_jsonb(snapshot) || jsonb_build_object('articulo_imagenes',coalesce(
      (select jsonb_agg(jsonb_build_object('id',i.id,'url',i.url,'position',i.position) order by i.position,i.id)
        from public.articulo_imagenes i where i.articulo_id = a.id),'[]'::jsonb)))
  from applications p join public.articulos a on a.id = p.articulo_id
  cross join lateral (select a.id,a.title,a.description,a.category,a.subcategory,a.estado_producto,a.size_class,a.location_reference,a.mode,a.estado,a.status,a.city,a.locality,a.price,
    a.owner_id,a.usuario_id,a.buyer_id,a.ganador_id,a.winner_id,a.recipient_id,
    a.image_url,a.imagen_url_principal,a.imagenes,a.delivered_at,a.updated_at,a.created_at) snapshot
  where auth.uid() is not null;
$$;
notify pgrst,'reload schema';
commit;
