begin;

create table if not exists public.sale_purchase_credits (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  articulo_id uuid not null,
  cost integer not null check(cost in (0,1)),
  state text not null check(state in ('held','completed','seller_canceled','buyer_canceled','removed')),
  created_at timestamptz not null default now(),settled_at timestamptz
);
create unique index if not exists sale_credit_active_article_idx on public.sale_purchase_credits(articulo_id) where state='held';
create index if not exists sale_credit_user_idx on public.sale_purchase_credits(usuario_id,state);
alter table public.sale_purchase_credits enable row level security;
drop policy if exists sale_credit_own on public.sale_purchase_credits;
create policy sale_credit_own on public.sale_purchase_credits for select using(usuario_id=auth.uid());
grant select on public.sale_purchase_credits to authenticated;
revoke insert,update,delete on public.sale_purchase_credits from anon,authenticated;

-- Existing reservations remain free, with no retroactive charge.
insert into public.sale_purchase_credits(usuario_id,articulo_id,cost,state)
select buyer_id,id,0,'held' from public.articulos a where mode='venta' and status='reservado' and buyer_id is not null
  and not exists(select 1 from public.sale_purchase_credits c where c.articulo_id=a.id and c.state='held');

create or replace function public.sale_purchase_status()
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); active_count integer; free_count integer; paid_count integer; balance integer;
begin
  if uid is null then raise exception 'Debes iniciar sesion.' using errcode='42501'; end if;
  select count(*),count(*) filter(where coalesce(c.cost,0)=0),count(*) filter(where c.cost=1)
    into active_count,free_count,paid_count from public.articulos a
    left join public.sale_purchase_credits c on c.articulo_id=a.id and c.usuario_id=uid and c.state='held'
    where a.mode='venta' and a.status='reservado' and a.buyer_id=uid;
  select saldo into balance from public.cupos where usuario_id=uid;
  return jsonb_build_object('active',active_count,'freeActive',free_count,'paidActive',paid_count,
    'heldCredits',paid_count,'freeLimit',5,'extraLimit',3,'maxActive',8,'balance',coalesce(balance,0));
end;
$$;

-- Keep the established transaction and chat/approval guards behind the metered entry point.
do $$ begin
  if to_regprocedure('public.transition_sale_unmetered(uuid,text)') is null then
    alter function public.transition_sale(uuid,text) rename to transition_sale_unmetered;
  end if;
end $$;
revoke all on function public.transition_sale_unmetered(uuid,text) from public,anon,authenticated;

create or replace function public.finish_sale_credit(p_article_id uuid,p_uid uuid,p_state text)
returns void language plpgsql security definer set search_path='' as $$
declare r public.sale_purchase_credits%rowtype;
begin
  update public.sale_purchase_credits set state=p_state,settled_at=now()
    where articulo_id=p_article_id and usuario_id=p_uid and state='held' returning * into r;
  if found and p_state='seller_canceled' and r.cost=1 then
    insert into public.cupos(usuario_id,saldo) values(r.usuario_id,1)
      on conflict(usuario_id) do update set saldo=public.cupos.saldo+1,updated_at=now();
    insert into public.cupos_historial(usuario_id,cantidad,concepto,referencia_id)
      values(r.usuario_id,1,'devolucion_compra_rechazada',r.id);
  end if;
end;
$$;

create or replace function public.transition_sale_with_credit(p_articulo_id uuid,p_action text,p_use_credit boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); target_uid uuid; a public.articulos%rowtype; s jsonb; result jsonb;
  receipt uuid; charge integer:=0; balance integer;
begin
  if uid is null then raise exception 'Debes iniciar sesion.' using errcode='42501'; end if;
  select case when p_action='reserve' then uid else buyer_id end into target_uid from public.articulos where id=p_articulo_id;
  if target_uid is not null then perform pg_advisory_xact_lock(hashtextextended(target_uid::text,1313)); end if;
  select * into a from public.articulos where id=p_articulo_id for update;
  if not found or a.mode<>'venta' then raise exception 'No se encontro una venta valida.'; end if;
  if p_action<>'reserve' and a.buyer_id is distinct from target_uid then
    raise exception 'La compra cambio. Actualiza la pagina antes de continuar.';
  end if;
  if p_action='reserve' and not(a.status='reservado' and a.estado='reservado' and a.buyer_id=uid) then
    if a.status<>'disponible' or a.estado<>'disponible' or a.buyer_id is not null then
      raise exception 'Este articulo ya no esta disponible.';
    end if;
    s:=public.sale_purchase_status();
    if (s->>'active')::integer>=8 then
      return s || jsonb_build_object('success',false,'code','SALE_LIMIT_REACHED',
        'error','Tienes 8 compras simultaneas. Finaliza o cancela una para liberar cupo.');
    end if;
    if (s->>'freeActive')::integer>=5 then
      if (s->>'paidActive')::integer>=3 then
        return s || jsonb_build_object('success',false,'code','SALE_LIMIT_REACHED','error','Ya utilizaste los 3 cupos adicionales.');
      end if;
      if not coalesce(p_use_credit,false) then
        return s || jsonb_build_object('success',false,'code','SALE_CREDIT_REQUIRED',
          'error','Tus 5 cupos gratuitos estan ocupados. Puedes reservar esta compra adicional con 1 credito.');
      end if;
      update public.cupos set saldo=saldo-1,updated_at=now() where usuario_id=uid and saldo>=1 returning saldo into balance;
      if not found then
        return s || jsonb_build_object('success',false,'code','INSUFFICIENT_CREDITS','error','No tienes creditos disponibles. Recarga desde tu perfil.');
      end if;
      charge:=1;
    end if;
    insert into public.sale_purchase_credits(usuario_id,articulo_id,cost,state)
      values(uid,p_articulo_id,charge,'held') returning id into receipt;
    if charge=1 then
      insert into public.cupos_historial(usuario_id,cantidad,concepto,referencia_id)
        values(uid,-1,'compra_retenida',receipt);
    end if;
  end if;
  result:=public.transition_sale_unmetered(p_articulo_id,p_action);
  if p_action='reserve' then
    select saldo into balance from public.cupos where usuario_id=uid;
    result:=result || jsonb_build_object('balance',coalesce(balance,0),'cost',charge,'purchases',public.sale_purchase_status());
  end if;
  return result;
end;
$$;

create or replace function public.transition_sale(p_articulo_id uuid,p_action text)
returns jsonb language sql security definer set search_path='' as $$
  select public.transition_sale_with_credit(p_articulo_id,p_action,false);
$$;

create or replace function public.guard_sale_credit_assignment()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then return new; end if;
  if new.mode='venta' and new.status='reservado' and new.buyer_id is not null
    and (tg_op='INSERT' or old.status is distinct from 'reservado' or old.buyer_id is distinct from new.buyer_id)
    and not exists(select 1 from public.sale_purchase_credits where articulo_id=new.id and usuario_id=new.buyer_id and state='held') then
    raise exception 'La compra debe reservarse mediante la transaccion de cupos.' using errcode='42501';
  end if;
  return new;
end;
$$;
drop trigger if exists guard_sale_credit_assignment on public.articulos;
create trigger guard_sale_credit_assignment before insert or update on public.articulos
for each row execute function public.guard_sale_credit_assignment();

create or replace function public.settle_sale_credit()
returns trigger language plpgsql security definer set search_path='' as $$
declare final_state text;
begin
  if old.mode='venta' and old.buyer_id is not null and old.status='reservado' then
    if tg_op='DELETE' then final_state:='removed';
    elsif new.status='entregado' then final_state:='completed';
    elsif new.status<>'reservado' or new.buyer_id is distinct from old.buyer_id or new.mode<>'venta' then
      final_state:=case when auth.uid()=old.owner_id and new.status='disponible' then 'seller_canceled'
        when auth.uid()=old.buyer_id then 'buyer_canceled' else 'removed' end;
    end if;
    if final_state is not null then perform public.finish_sale_credit(old.id,old.buyer_id,final_state); end if;
  end if;
  if tg_op='DELETE' then return old; else return new; end if;
end;
$$;
drop trigger if exists settle_sale_credit_update on public.articulos;
create trigger settle_sale_credit_update after update on public.articulos
for each row execute function public.settle_sale_credit();
drop trigger if exists settle_sale_credit_delete on public.articulos;
create trigger settle_sale_credit_delete before delete on public.articulos
for each row execute function public.settle_sale_credit();

create or replace function public.account_credit_status()
returns jsonb language plpgsql security definer set search_path='' as $$
declare donations jsonb; purchases jsonb;
begin
  donations:=public.donation_application_status();
  purchases:=public.sale_purchase_status();
  return jsonb_build_object('balance',donations->'balance','donations',donations,'purchases',purchases);
end;
$$;

revoke all on function public.finish_sale_credit(uuid,uuid,text),public.guard_sale_credit_assignment(),public.settle_sale_credit()
  from public,anon,authenticated;
revoke all on function public.transition_sale_with_credit(uuid,text,boolean),public.transition_sale(uuid,text),
  public.sale_purchase_status(),public.account_credit_status() from public,anon;
grant execute on function public.transition_sale_with_credit(uuid,text,boolean),public.transition_sale(uuid,text),
  public.sale_purchase_status(),public.account_credit_status() to authenticated;
notify pgrst,'reload schema';
commit;
