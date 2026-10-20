begin;

-- Server-owned receipts survive deletion and make publishing requests idempotent.
create table if not exists public.article_publication_credits (
  article_id uuid primary key,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  cost integer not null default 0 check(cost in(0,1)),
  feature_ready boolean not null default false,
  publication_ready boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.article_publication_credits add column if not exists publication_ready boolean not null default false;
create index if not exists publication_credit_user_idx on public.article_publication_credits(usuario_id,created_at);
create index if not exists sale_publication_owner_idx on public.articulos(owner_id,created_at) where mode='venta';
alter table public.article_publication_credits enable row level security;
drop policy if exists publication_credit_own on public.article_publication_credits;
create policy publication_credit_own on public.article_publication_credits for select using(usuario_id=auth.uid());
grant select on public.article_publication_credits to authenticated;
revoke insert,update,delete on public.article_publication_credits from anon,authenticated;

-- Paused/reviewed/reserved sales still occupy a slot. Completed or expired sales do not;
-- a reservation remains active beyond the usual 60-day lifetime.
create or replace function public.sale_publication_active(p_mode text,p_estado text,p_status text,p_created timestamptz)
returns boolean language sql stable set search_path='' as $$
  select p_mode='venta'
    and coalesce(nullif(p_estado,''),p_status,'disponible') not in ('entregado','delivered')
    and (p_created>now()-interval '60 days'
      or coalesce(nullif(p_estado,''),p_status) in ('reservado','reserved'));
$$;
revoke all on function public.sale_publication_active(text,text,text,timestamptz) from public,anon;
grant execute on function public.sale_publication_active(text,text,text,timestamptz) to authenticated;

create or replace function public.sale_publication_status()
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); active_count integer; balance integer;
begin
  if uid is null then raise exception 'Debes iniciar sesion.' using errcode='42501'; end if;
  select count(*) into active_count from public.articulos a where a.owner_id=uid
    and public.sale_publication_active(a.mode,a.estado,a.status,a.created_at);
  select saldo into balance from public.cupos where usuario_id=uid;
  return jsonb_build_object('active',active_count,'freeLimit',3,'freeRemaining',greatest(0,3-active_count),
    'requiresCredit',active_count>=3,'balance',coalesce(balance,0));
end;
$$;
revoke all on function public.sale_publication_status() from public,anon;
grant execute on function public.sale_publication_status() to authenticated;

-- Keep the existing 20-publication ceiling, using the same lock to avoid inverted lock ordering.
create or replace function public.guard_publication_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare old_active boolean;
begin
  if lower(trim(coalesce(nullif(new.estado, ''), new.status, 'disponible')))
      in ('entregado', 'delivered') then return new; end if;
  if tg_op = 'UPDATE' then
    old_active := lower(trim(coalesce(nullif(old.estado, ''), old.status, 'disponible')))
      not in ('entregado', 'delivered');
    if old.owner_id = new.owner_id and old_active then return new; end if;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(new.owner_id::text, 1313));
  if (select count(*) from public.articulos a
      where a.owner_id = new.owner_id and a.id is distinct from new.id
        and lower(trim(coalesce(nullif(a.estado, ''), a.status, 'disponible')))
          not in ('entregado', 'delivered')
        and (a.created_at > now() - interval '1440 hours'
          or lower(coalesce(nullif(a.estado, ''), a.status)) in ('reservado', 'reserved'))) >= 20 then
    raise exception 'Puedes tener un máximo de 20 publicaciones activas. Finaliza una entrega o elimina una publicación disponible antes de publicar otra.';
  end if;
  return new;
end;
$$;

-- Direct inserts, mode changes and reactivations cannot bypass the RPC's paid consent.
-- The existing general publication_limit/expiry triggers stay in place.
create or replace function public.guard_publication_credit()
returns trigger language plpgsql security definer set search_path='' as $$
declare active_count integer; authorized_cost integer;
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
  if active_count>=3 and not (
    (tg_op='INSERT' and coalesce(authorized_cost,0)=1)
    or (tg_op='UPDATE' and exists(select 1 from public.article_publication_credits
      where article_id=new.id and usuario_id=new.owner_id and cost=1))) then
    raise exception 'Ya tienes 3 ventas activas. Esta publicacion adicional requiere confirmar 1 credito.' using errcode='P0001',hint='PUBLICATION_CREDIT_REQUIRED';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_publication_credit() from public,anon,authenticated;
drop trigger if exists zz_publication_credit on public.articulos;
create trigger zz_publication_credit before insert or update on public.articulos
for each row execute function public.guard_publication_credit();

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
    estado_producto,status,estado,imagenes,image_url,imagen_url,imagen_url_principal,is_featured)
  values(p_request_id,uid,coalesce(nullif(display_name,''),'Usuario'),trim(p_article->>'title'),coalesce(p_article->>'description',''),p_article->>'mode',
    case when p_article->>'mode'='venta' then (p_article->>'price')::numeric else 0 end,
    p_article->>'city',p_article->>'locality',p_article->>'category',p_article->>'subcategory',p_article->>'subcategory',
    greatest(1,least(10,coalesce((p_article->>'estado_producto')::integer,8))),'disponible','disponible',urls,urls[1],urls[1],urls[1],false) returning * into a;
  if charge=1 then insert into public.cupos_historial(usuario_id,cantidad,concepto,referencia_id) values(uid,-1,'publicacion_venta',a.id); end if;
  return jsonb_build_object('success',true,'article',to_jsonb(a),'alreadyExists',false,'cost',charge,'balance',balance);
end;
$$;
revoke all on function public.publish_article_with_credit(jsonb,uuid,boolean) from public,anon;
grant execute on function public.publish_article_with_credit(jsonb,uuid,boolean) to authenticated;

-- A private, single-use permit prevents direct updates from bypassing feature_article.
create or replace function public.feature_article(p_articulo_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); a public.articulos%rowtype; balance integer;
begin
  if uid is null then raise exception 'Debes iniciar sesion.' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,1313));
  select * into a from public.articulos where id=p_articulo_id for update;
  if not found or a.owner_id is distinct from uid then raise exception 'Solo puedes destacar tus publicaciones.' using errcode='42501'; end if;
  if exists(select 1 from public.usuarios where id=uid and (is_blocked or bloqueado)) then raise exception 'Tu cuenta esta bloqueada.' using errcode='42501'; end if;
  select saldo into balance from public.cupos where usuario_id=uid;
  if a.is_featured then return jsonb_build_object('article',to_jsonb(a),'balance',coalesce(balance,0)); end if;
  update public.cupos set saldo=saldo-1,updated_at=now() where usuario_id=uid and saldo>=1 returning saldo into balance;
  if not found then raise exception 'No tienes creditos suficientes para destacar.'; end if;
  insert into public.article_publication_credits(article_id,usuario_id,feature_ready) values(a.id,uid,true)
    on conflict(article_id) do update set feature_ready=true;
  insert into public.cupos_historial(usuario_id,cantidad,concepto,referencia_id) values(uid,-1,'destacado',a.id);
  update public.articulos set is_featured=true,updated_at=now() where id=a.id returning * into a;
  return jsonb_build_object('article',to_jsonb(a),'balance',balance);
end;
$$;
revoke all on function public.feature_article(uuid) from public,anon;
grant execute on function public.feature_article(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
