begin;

create or replace function public.staff_article_content(p_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('title',a.title,'description',coalesce(a.description,''),'images',coalesce((
    select jsonb_agg(url order by first_position) from (
      select url,min(position) as first_position from (
        select url,row_number() over(order by position,created_at,id) as position from public.articulo_imagenes where articulo_id=a.id
        union all select value,1000+ordinality from jsonb_array_elements_text(to_jsonb(a.imagenes)) with ordinality
        union all select a.image_url,2000 union all select a.imagen_url_principal,2001 union all select a.imagen_url,2002
      ) candidates where nullif(trim(url),'') is not null group by url
    ) images),'[]'::jsonb)) from public.articulos a where a.id=p_id;
$$;
revoke all on function public.staff_article_content(uuid) from public,anon,authenticated;

create or replace function public.staff_article_detail(p_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; content jsonb;
begin
  perform public.staff_require('moderation');
  content:=public.staff_article_content(p_id);
  if content is null then raise exception 'La publicacion ya no existe.'; end if;
  select jsonb_build_object('id',id,'title',title,'description',description,'mode',mode,'price',price,
    'status',status,'review_status',review_status,'city',city,'locality',locality,'category',coalesce(category,categoria),
    'image_url',content->'images'->>0,'imagenes',content->'images','created_at',created_at,
    'owner_name',(select nombre from public.usuarios where id=a.owner_id),
    'content_version',md5(content::text)) into result from public.articulos a where id=p_id;
  return result;
end;
$$;
revoke all on function public.staff_article_detail(uuid) from public,anon;
grant execute on function public.staff_article_detail(uuid) to authenticated;

drop function if exists public.staff_edit_article(uuid,text,text,jsonb,text,text);
create or replace function public.staff_edit_article(p_id uuid,p_title text,p_description text,p_images jsonb,p_version text,p_reason text,p_details text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare original public.articulos%rowtype; before_content jsonb; after_content jsonb; images text[];
  v_title text:=trim(coalesce(p_title,'')); v_description text:=trim(coalesce(p_description,''));
  reason text:=trim(coalesce(p_reason,'')); details text:=trim(coalesce(p_details,'')); audit_reason text;
  contact_text text; message_id uuid; changed_fields text[]:='{}';
begin
  perform public.staff_require('moderation');
  if length(reason) not between 8 and 500 then raise exception 'Indica un motivo de 8 a 500 caracteres.'; end if;
  audit_reason:=reason||case when details='' then '' else ': '||details end;
  if length(audit_reason)>500 then raise exception 'El motivo y la nota interna no pueden superar los 500 caracteres.'; end if;
  if length(v_title) not between 3 and 150 or length(v_description)>5000 then raise exception 'Revisa el titulo y la descripcion.'; end if;
  contact_text:=translate(lower(v_title||' '||v_description),'áéíóúüñ','aeiouun');
  if contact_text ~ '@[a-z0-9]|https?://|www[.]|wa[.]me|wa[.]link|t[.]me/|whats[ ]*app|wasap|wsp|facebook|instagram|telegram|correo|e-mail|email|gmail|hotmail|outlook|llamame|escribeme|contactame'
    or contact_text ~ '[0-9]([[:space:]().+-]*[0-9]){6,}'
    or contact_text ~ '\m(cero|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve)([[:space:]]+(cero|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve)){3,}\M' then
    raise exception 'Retira telefonos, correos y formas de contacto externo del titulo y la descripcion.';
  end if;
  if jsonb_typeof(p_images) is distinct from 'array' then raise exception 'La galeria no es valida.'; end if;
  if jsonb_array_length(p_images)>20 or exists(select 1 from jsonb_array_elements(p_images) value where jsonb_typeof(value)<>'string') then
    raise exception 'La galeria no es valida.';
  end if;
  select * into original from public.articulos where id=p_id for update;
  if not found then raise exception 'La publicacion ya no existe.'; end if;
  if original.status in ('reservado','entregado') then raise exception 'No se puede editar una reserva o entrega desde moderacion.'; end if;
  perform 1 from public.articulo_imagenes where articulo_id=p_id order by id for update;
  before_content:=public.staff_article_content(p_id);
  if p_version is distinct from md5(before_content::text) then
    raise exception 'La publicacion cambio mientras editabas. Cierra y vuelve a abrir la edicion.';
  end if;
  if exists(select 1 from jsonb_array_elements_text(p_images) selected(url) where not (before_content->'images' ? selected.url) or selected.url !~ '^https?://')
    or (select count(*)<>count(distinct value) from jsonb_array_elements_text(p_images)) then
    raise exception 'Solo puedes conservar y ordenar fotos existentes, sin duplicarlas.';
  end if;
  select coalesce(array_agg(value order by ordinality),'{}') into images from jsonb_array_elements_text(p_images) with ordinality;
  after_content:=jsonb_build_object('title',v_title,'description',v_description,'images',p_images);
  if before_content=after_content then raise exception 'No hay cambios para guardar.'; end if;
  if before_content->>'title'<>v_title then changed_fields:=array_append(changed_fields,'titulo'); end if;
  if before_content->>'description'<>v_description then changed_fields:=array_append(changed_fields,'descripcion'); end if;
  if before_content->'images'<>p_images then changed_fields:=array_append(changed_fields,'fotos'); end if;
  perform set_config('mibatute.staff_action','on',true);
  delete from public.articulo_imagenes where articulo_id=p_id and not(url=any(images));
  update public.articulo_imagenes i set position=selected.ordinality::integer-1
    from jsonb_array_elements_text(p_images) with ordinality selected(url,ordinality) where i.articulo_id=p_id and i.url=selected.url;
  update public.articulos set title=v_title,description=v_description,imagenes=images,
    image_url=coalesce(images[1],''),imagen_url=coalesce(images[1],''),imagen_url_principal=coalesce(images[1],'')
    where id=p_id;
  insert into public.staff_audit(actor_id,action,target_id,reason,changes)
    values(auth.uid(),'article.edit',p_id,audit_reason,jsonb_build_object('before',before_content,'after',after_content,'fields',changed_fields,'reason',reason,'internal_note',details));
  insert into public.system_messages(sender_id,title,body) values(auth.uid(),'Publicacion ajustada por administracion',
    concat('El equipo de MiBatute ajusto tu publicacion "',v_title,'" para mantenerla acorde con las normas de la comunidad.',
      E'\nCampos corregidos: ',array_to_string(changed_fields,', '),E'\nMotivo: ',reason,
      E'\nEl contacto debe mantenerse en el chat de la plataforma. El estado de tu publicacion no cambio.')) returning id into message_id;
  insert into public.system_message_receipts(message_id,user_id) values(message_id,original.owner_id);
  return jsonb_build_object('success',true,'id',p_id,'notice','Publicación corregida. El propietario recibió el motivo en su buzón.');
end;
$$;
revoke all on function public.staff_edit_article(uuid,text,text,jsonb,text,text,text) from public,anon;
grant execute on function public.staff_edit_article(uuid,text,text,jsonb,text,text,text) to authenticated;
notify pgrst,'reload schema';
commit;
