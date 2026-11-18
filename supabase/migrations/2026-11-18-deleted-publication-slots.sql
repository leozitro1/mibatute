begin;

-- Metadata only; no article content. Rows survive article deletion and clients cannot edit them.
create table if not exists public.publication_slot_history (
 article_id uuid primary key,
 usuario_id uuid not null references auth.users(id) on delete cascade,
 mode text not null check(mode in ('venta','donacion')),
 published_at timestamptz not null,
 deleted_at timestamptz,
 held_until timestamptz
);
alter table public.publication_slot_history enable row level security;
revoke all on public.publication_slot_history from public,anon,authenticated;
create index if not exists publication_slot_held_idx on public.publication_slot_history(usuario_id,mode,held_until) where held_until is not null;
insert into public.publication_slot_history(article_id,usuario_id,mode,published_at)
 select a.id,a.owner_id,a.mode,coalesce(r.created_at,a.created_at,now())
 from public.articulos a left join public.article_publication_credits r on r.article_id=a.id
 where a.mode in ('venta','donacion') on conflict(article_id) do nothing;

create or replace function public.held_publication_slots(p_owner uuid,p_mode text)
returns integer language sql stable security definer set search_path='' as $$
 select count(*)::integer from public.publication_slot_history
 where usuario_id=p_owner and mode=p_mode and held_until>now();
$$;
revoke all on function public.held_publication_slots(uuid,text) from public,anon,authenticated;

create or replace function public.record_publication_slot()
returns trigger language plpgsql security definer set search_path='' as $$
declare published timestamptz;active boolean;
begin
 if tg_op='INSERT' then
  perform pg_advisory_xact_lock(hashtextextended(new.owner_id::text,1313));
  insert into public.publication_slot_history(article_id,usuario_id,mode,published_at)
   values(new.id,new.owner_id,new.mode,now());
  return new;
 end if;
 -- Auth-account cascades must remain possible after the parent user has been removed.
 if not exists(select 1 from auth.users where id=old.owner_id) then return old;end if;
 perform pg_advisory_xact_lock(hashtextextended(old.owner_id::text,1313));
 select published_at into published from public.publication_slot_history where article_id=old.id;
 published:=coalesce(published,old.created_at,now());
 active:=case when old.mode='venta' then public.sale_publication_active(old.mode,old.estado,old.status,old.created_at)
  else public.donation_publication_active(old.mode,old.estado,old.status,old.created_at) end;
 insert into public.publication_slot_history(article_id,usuario_id,mode,published_at,deleted_at,held_until)
 values(old.id,old.owner_id,old.mode,published,now(),case when active and now()>published+interval '12 hours' then now()+interval '10 days' end)
 on conflict(article_id) do update set mode=excluded.mode,deleted_at=excluded.deleted_at,held_until=excluded.held_until;
 return old;
end;
$$;
revoke all on function public.record_publication_slot() from public,anon,authenticated;
drop trigger if exists aaa_publication_slot on public.articulos;
create trigger aaa_publication_slot before insert or delete on public.articulos for each row execute function public.record_publication_slot();

create or replace function public.publication_deletion_status(p_article_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.articulos%rowtype;published timestamptz;active boolean;holds boolean;
begin
 if auth.uid() is null then raise exception 'Debes iniciar sesión.' using errcode='42501';end if;
 select * into a from public.articulos where id=p_article_id and owner_id=auth.uid();
 if not found then raise exception 'No puedes eliminar esta publicación.' using errcode='42501';end if;
 select published_at into published from public.publication_slot_history where article_id=a.id;
 published:=coalesce(published,a.created_at,now());
 active:=case when a.mode='venta' then public.sale_publication_active(a.mode,a.estado,a.status,a.created_at)
  else public.donation_publication_active(a.mode,a.estado,a.status,a.created_at) end;
 holds:=coalesce(active,false) and now()>published+interval '12 hours';
 return jsonb_build_object('holdsSlot',holds,'releaseAt',case when holds then now()+interval '10 days' end,
  'freeDeleteUntil',published+interval '12 hours','active',coalesce(active,false));
end;
$$;
revoke all on function public.publication_deletion_status(uuid) from public,anon;
grant execute on function public.publication_deletion_status(uuid) to authenticated;

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
  active_count:=active_count+public.held_publication_slots(new.owner_id,'venta');
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

create or replace function public.guard_donation_publication_limit()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.mode is distinct from 'donacion' then return new; end if;
 if coalesce(new.price,0)<>0 then
  raise exception 'Una donación debe ser gratuita. Si esperas un pago, publícala como venta.' using errcode='P0001';
 end if;
 if not public.donation_publication_active(new.mode,new.estado,new.status,new.created_at) then return new; end if;
 -- Existing publications remain editable, including accounts previously above the limit.
 if tg_op='UPDATE' then
  if old.owner_id=new.owner_id and public.donation_publication_active(old.mode,old.estado,old.status,old.created_at) then return new; end if;
 end if;
 perform pg_advisory_xact_lock(hashtextextended(new.owner_id::text,1313));
 if (select count(*) from public.articulos a where a.owner_id=new.owner_id and a.id is distinct from new.id
  and public.donation_publication_active(a.mode,a.estado,a.status,a.created_at))+public.held_publication_slots(new.owner_id,'donacion')>=3 then
  raise exception 'Puedes tener máximo 3 donaciones activas. Libera un cupo antes de publicar otra. Si eliminas después de 12 horas, el cupo se retiene 10 días. Las pausadas y reservadas también cuentan.' using errcode='P0001';
 end if;
 return new;
end;
$$;
revoke all on function public.guard_donation_publication_limit() from public,anon,authenticated;

create or replace function public.sale_publication_status()
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();active_count integer;balance integer;free_limit integer;donation_count integer;held_sales integer;held_donations integer;
begin
 if uid is null then raise exception 'Debes iniciar sesion.' using errcode='42501';end if;
 select count(*) into active_count from public.articulos a where a.owner_id=uid
  and public.sale_publication_active(a.mode,a.estado,a.status,a.created_at);
 select count(*) into donation_count from public.articulos a where a.owner_id=uid
  and public.donation_publication_active(a.mode,a.estado,a.status,a.created_at);
 held_sales:=public.held_publication_slots(uid,'venta');
 held_donations:=public.held_publication_slots(uid,'donacion');
 free_limit:=public.sale_free_limit(uid);
 select saldo into balance from public.cupos where usuario_id=uid;
 return jsonb_build_object('active',active_count,'freeLimit',free_limit,'donationBonus',free_limit=4,
  'freeRemaining',greatest(0,free_limit-active_count-held_sales),'requiresCredit',active_count+held_sales>=free_limit,'balance',coalesce(balance,0),
  'donationActive',donation_count,'donationLimit',3,'donationRemaining',greatest(0,3-donation_count-held_donations),
  'occupied',active_count+held_sales,'heldSales',held_sales,'heldDonations',held_donations,'donationOccupied',donation_count+held_donations,
  'nextSlotReleaseAt',(select min(held_until) from public.publication_slot_history where usuario_id=uid and held_until>now()));
end $$;
revoke all on function public.sale_publication_status() from public,anon;
grant execute on function public.sale_publication_status() to authenticated;
notify pgrst,'reload schema';
commit;
