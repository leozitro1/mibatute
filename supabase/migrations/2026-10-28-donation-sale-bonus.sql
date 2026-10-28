begin;
-- No client-executable lookup of another owner's donation eligibility.
create or replace function public.sale_free_limit(p_owner uuid,p_exclude uuid default null)
returns integer language sql stable security definer set search_path='' as $$
 select case when exists(select 1 from public.articulos a where a.owner_id=p_owner
  and a.id is distinct from p_exclude and a.mode='donacion'
  and coalesce(nullif(a.estado,''),a.status)='disponible' and a.status='disponible'
  and a.created_at>now()-interval '60 days'
  and length(btrim(coalesce(nullif(a.title,''),to_jsonb(a)->>'titulo','')))>0
  and length(btrim(coalesce(a.description,'')))>0
  and (coalesce(nullif(a.image_url,''),a.imagen_url_principal,'')~'^https?://'
    or exists(select 1 from unnest(a.imagenes) url where url~'^https?://')
    or exists(select 1 from public.articulo_imagenes i where i.articulo_id=a.id and i.url~'^https?://'))
  and not exists(select 1 from jsonb_each_text(to_jsonb(a)) flags where flags.key in
   ('review_status','approval_status','moderation_status','revision_status')
   and nullif(btrim(flags.value),'') is not null and lower(btrim(flags.value)) not in ('approved','aprobado','none'))
 ) then 4 else 3 end;
$$;
revoke all on function public.sale_free_limit(uuid,uuid) from public,anon,authenticated;

create or replace function public.sale_publication_status()
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();active_count integer;balance integer;free_limit integer;
begin
 if uid is null then raise exception 'Debes iniciar sesion.' using errcode='42501';end if;
 select count(*) into active_count from public.articulos a where a.owner_id=uid
  and public.sale_publication_active(a.mode,a.estado,a.status,a.created_at);
 free_limit:=public.sale_free_limit(uid);
 select saldo into balance from public.cupos where usuario_id=uid;
 return jsonb_build_object('active',active_count,'freeLimit',free_limit,'donationBonus',free_limit=4,
  'freeRemaining',greatest(0,free_limit-active_count),'requiresCredit',active_count>=free_limit,'balance',coalesce(balance,0));
end $$;
revoke all on function public.sale_publication_status() from public,anon;
grant execute on function public.sale_publication_status() to authenticated;

create or replace function public.guard_publication_credit()
returns trigger language plpgsql security definer set search_path='' as $$
declare active_count integer; authorized_cost integer; free_limit integer;
begin
  if new.mode not in ('venta','donacion') or new.mode is null then raise exception 'Tipo de publicacion invalido.'; end if;
  if tg_op='UPDATE' and (new.id is distinct from old.id or new.owner_id is distinct from old.owner_id) then
    raise exception 'No puedes cambiar la identidad o el propietario de una publicacion.' using errcode='42501';
  end if;
  if tg_op='INSERT' then
    update public.article_publication_credits set publication_ready=false
      where article_id=new.id and usuario_id=new.owner_id and publication_ready returning cost into authorized_cost;
    if not found and exists(select 1 from public.article_publication_credits where article_id=new.id) then
      raise exception 'Este identificador de publicacion ya fue utilizado.' using errcode='42501';
    end if;
  end if;
  if (tg_op='INSERT' and coalesce(new.is_featured,false))
    or (tg_op='UPDATE' and coalesce(new.is_featured,false) and not coalesce(old.is_featured,false)) then
    update public.article_publication_credits set feature_ready=false
      where article_id=new.id and usuario_id=new.owner_id and feature_ready;
    if not found then raise exception 'Destacar requiere confirmar 1 credito desde la opcion Destacar.' using errcode='42501'; end if;
  end if;
  if not public.sale_publication_active(new.mode,new.estado,new.status,new.created_at) then return new; end if;
  if tg_op='UPDATE' and public.sale_publication_active(old.mode,old.estado,old.status,old.created_at) then return new; end if;
  -- Same lock as donation/purchase/credit operations; all publications of an owner serialize.
  perform pg_advisory_xact_lock(hashtextextended(new.owner_id::text,1313));
  select count(*) into active_count from public.articulos a where a.owner_id=new.owner_id and a.id<>new.id
    and public.sale_publication_active(a.mode,a.estado,a.status,a.created_at);
  free_limit:=public.sale_free_limit(new.owner_id,new.id);
  if active_count>=free_limit and not (
    (tg_op='INSERT' and coalesce(authorized_cost,0)=1)
    or (tg_op='UPDATE' and exists(select 1 from public.article_publication_credits
      where article_id=new.id and usuario_id=new.owner_id and cost=1))) then
    raise exception 'Alcanzaste tus % ventas gratuitas. Esta publicacion adicional requiere confirmar 1 credito.',free_limit using errcode='P0001',hint='PUBLICATION_CREDIT_REQUIRED';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_publication_credit() from public,anon,authenticated;

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

notify pgrst,'reload schema';
commit;
