begin;

-- Public detail fields only; private chat, contact and payment data stay excluded.
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
    'estado_producto',to_jsonb(a)->'estado_producto','is_featured',to_jsonb(a)->'is_featured',
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
