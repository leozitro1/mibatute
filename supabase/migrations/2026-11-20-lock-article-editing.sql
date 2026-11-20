begin;

create or replace function public.article_has_interested(p_article_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.postulaciones p where p.articulo_id=p_article_id)
 or exists(select 1 from public.articulos a where a.id=p_article_id
  and (a.buyer_id is not null or coalesce(a.ganador_id,a.winner_id,a.recipient_id) is not null))
 or exists(select 1 from public.chats c where c.articulo_id=p_article_id and c.status in ('pending','open'));
$$;
revoke all on function public.article_has_interested(uuid) from public,anon,authenticated;

create or replace function public.assert_article_editable(p_article_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare a public.articulos%rowtype;
begin
 select * into a from public.articulos where id=p_article_id for update;
 if auth.uid() is null or not found or a.owner_id is distinct from auth.uid() then
  raise exception 'Solo puedes editar tus publicaciones.' using errcode='42501';
 end if;
 if public.article_has_interested(a.id) then
  raise exception 'Esta publicación ya tiene ofertas o solicitudes de donación y no se puede editar.' using errcode='P0001';
 end if;
end;
$$;
revoke all on function public.assert_article_editable(uuid) from public,anon;
grant execute on function public.assert_article_editable(uuid) to authenticated;

create or replace function public.guard_interested_article_edit()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is distinct from old.owner_id then return new;end if;
 if exists(select 1 from unnest(array['title','titulo','description','descripcion','price','precio','mode','tipo',
  'category','categoria','subcategory','subcategoria','city','ciudad','locality','localidad_es','location_reference',
  'estado_producto','size_class','image_url','imagen_url','imagen_url_principal','imagenes','created_at']) field
  where to_jsonb(new)->field is distinct from to_jsonb(old)->field) then
  perform public.assert_article_editable(old.id);
 end if;
 return new;
end;
$$;
revoke all on function public.guard_interested_article_edit() from public,anon,authenticated;
drop trigger if exists interested_article_edit on public.articulos;
create trigger interested_article_edit before update on public.articulos
for each row execute function public.guard_interested_article_edit();

create or replace function public.guard_interested_photo_edit()
returns trigger language plpgsql security definer set search_path='' as $$
declare ids uuid[];a public.articulos%rowtype;
begin
 if tg_op='INSERT' then ids:=array[new.articulo_id];
 elsif tg_op='DELETE' then ids:=array[old.articulo_id];
 else ids:=array[old.articulo_id,new.articulo_id];end if;
 for a in select * from public.articulos where id=any(ids) order by id for update loop
  if auth.uid()=a.owner_id then perform public.assert_article_editable(a.id);end if;
 end loop;
 if tg_op='DELETE' then return old;end if;
 return new;
end;
$$;
revoke all on function public.guard_interested_photo_edit() from public,anon,authenticated;
drop trigger if exists interested_photo_edit on public.articulo_imagenes;
create trigger interested_photo_edit before insert or update or delete on public.articulo_imagenes
for each row execute function public.guard_interested_photo_edit();

-- Requests and edits serialize on the same article, including direct inserts.
create or replace function public.lock_requested_article()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.articulos where id=new.articulo_id for update;
 return new;
end;
$$;
revoke all on function public.lock_requested_article() from public,anon,authenticated;
drop trigger if exists aaa_lock_requested_article on public.postulaciones;
create trigger aaa_lock_requested_article before insert or update of articulo_id on public.postulaciones
for each row execute function public.lock_requested_article();

-- Commit photo removal and cover/order changes together before external-file cleanup.
create or replace function public.owner_remove_article_photo(p_image_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare image public.articulo_imagenes%rowtype;parent_id uuid;urls text[];
begin
 select articulo_id into parent_id from public.articulo_imagenes where id=p_image_id;
 perform public.assert_article_editable(parent_id);
 select * into image from public.articulo_imagenes where id=p_image_id and articulo_id=parent_id for update;
 if not found then raise exception 'La foto ya no está disponible. Actualiza la publicación.' using errcode='P0001';end if;
 delete from public.articulo_imagenes where id=image.id;
 with ordered as (select id,row_number() over(order by position,id)-1 as pos from public.articulo_imagenes where articulo_id=parent_id)
 update public.articulo_imagenes i set position=ordered.pos::integer from ordered where i.id=ordered.id;
 select array_agg(url order by position,id) into urls from public.articulo_imagenes where articulo_id=parent_id;
 update public.articulos set imagenes=coalesce(urls,array[]::text[]),image_url=urls[1],imagen_url=urls[1],imagen_url_principal=urls[1],updated_at=now() where id=parent_id;
 return to_jsonb(image);
end;
$$;
revoke all on function public.owner_remove_article_photo(uuid) from public,anon;
grant execute on function public.owner_remove_article_photo(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
