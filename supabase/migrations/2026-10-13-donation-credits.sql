begin;

-- No article/application FK: this receipt must survive their deletion.
create table if not exists public.donation_application_credits (
  id uuid primary key,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  articulo_id uuid not null,
  cost integer not null check (cost in (0,1)),
  state text not null check (state in ('pending','chosen','refunded','withdrawn','legacy')),
  created_at timestamptz not null default now(),
  settled_at timestamptz
);
create index if not exists donation_credit_user_idx on public.donation_application_credits(usuario_id,created_at);
create index if not exists donation_credit_pending_idx on public.donation_application_credits(articulo_id) where state='pending';
alter table public.donation_application_credits enable row level security;
drop policy if exists donation_credit_own on public.donation_application_credits;
create policy donation_credit_own on public.donation_application_credits for select using(usuario_id=auth.uid());
grant select on public.donation_application_credits to authenticated;
revoke insert,update,delete on public.donation_application_credits from anon,authenticated;

-- Existing applications stay free; nobody is charged retroactively.
insert into public.donation_application_credits(id,usuario_id,articulo_id,cost,state,created_at)
select p.id,p.usuario_id,p.articulo_id,0,'pending',p.created_at from public.postulaciones p
join public.articulos a on a.id=p.articulo_id where a.mode='donacion'
on conflict(id) do nothing;
insert into public.donation_application_credits(id,usuario_id,articulo_id,cost,state,created_at)
select id,usuario_id,articulo_id,0,'legacy',created_at from public.postulacion_historial
on conflict(id) do nothing;

create or replace function public.finish_donation_credit(p_id uuid,p_state text)
returns void language plpgsql security definer set search_path='' as $$
declare r public.donation_application_credits%rowtype;
begin
  update public.donation_application_credits set state=p_state,settled_at=now()
    where id=p_id and state='pending' returning * into r;
  if found and p_state='refunded' and r.cost=1 then
    insert into public.cupos(usuario_id,saldo) values(r.usuario_id,1)
      on conflict(usuario_id) do update set saldo=public.cupos.saldo+1,updated_at=now();
    insert into public.cupos_historial(usuario_id,cantidad,concepto,referencia_id)
      values(r.usuario_id,1,'devolucion_solicitud',r.id);
  end if;
end;
$$;

create or replace function public.settle_donation_credits(p_uid uuid)
returns void language plpgsql security definer set search_path='' as $$
declare r record;
begin
  for r in select c.id,c.usuario_id,coalesce(a.ganador_id,a.winner_id,a.recipient_id) as winner
    from public.donation_application_credits c left join public.articulos a on a.id=c.articulo_id
    where c.usuario_id=p_uid and c.state='pending' and (a.id is null
      or a.created_at <= now()-interval '60 days' or coalesce(a.ganador_id,a.winner_id,a.recipient_id) is not null)
  loop
    perform public.finish_donation_credit(r.id,case when r.winner=r.usuario_id then 'chosen' else 'refunded' end);
  end loop;
end;
$$;

create or replace function public.donation_application_status()
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); free_at timestamptz; pending integer; balance integer;
begin
  if uid is null then raise exception 'Debes iniciar sesion.' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,1313));
  perform public.settle_donation_credits(uid);
  select max(created_at)+interval '6 hours' into free_at from public.donation_application_credits
    where usuario_id=uid and cost=0;
  select count(*) into pending from public.postulaciones p join public.articulos a on a.id=p.articulo_id
    where p.usuario_id=uid and a.mode='donacion' and a.created_at>now()-interval '60 days'
      and coalesce(a.ganador_id,a.winner_id,a.recipient_id) is null;
  select saldo into balance from public.cupos where usuario_id=uid;
  return jsonb_build_object('balance',coalesce(balance,0),'pending',pending,'maxPending',3,
    'heldCredits',(select coalesce(sum(cost),0) from public.donation_application_credits where usuario_id=uid and state='pending'),
    'freeAvailable',free_at is null or free_at<=now(),'nextFreeAt',free_at);
end;
$$;

create or replace function public.apply_for_donation(p_article_id uuid,p_message text,p_use_credit boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); a public.articulos%rowtype; s jsonb; pid uuid; charge integer:=0; balance integer;
begin
  if uid is null then raise exception 'Debes iniciar sesion.' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,1313));
  select * into a from public.articulos where id=p_article_id for update;
  if not found or a.mode<>'donacion' or a.created_at<=now()-interval '60 days' then
    raise exception 'Esta donacion no esta disponible.';
  end if;
  if exists(select 1 from public.usuarios where id=uid and (is_blocked or bloqueado)) then
    raise exception 'Tu cuenta esta bloqueada.' using errcode='42501';
  end if;
  if not exists(select 1 from auth.users where id=uid and email_confirmed_at is not null) then
    raise exception 'Debes verificar tu correo.' using errcode='42501';
  end if;
  if length(trim(coalesce(p_message,''))) not between 10 and 140 then raise exception 'La justificacion debe tener entre 10 y 140 caracteres.'; end if;
  select id into pid from public.postulaciones where articulo_id=p_article_id and usuario_id=uid;
  s:=public.donation_application_status();
  if pid is not null then
    return jsonb_build_object('success',true,'id',pid,'alreadyExists',true,'balance',s->'balance');
  end if;
  if (s->>'pending')::integer>=3 then
    return jsonb_build_object('success',false,'code','PENDING_LIMIT','error','Tienes 3 solicitudes pendientes. Espera una decision o cancela alguna antes de enviar otra.');
  end if;
  if not (s->>'freeAvailable')::boolean then
    if not coalesce(p_use_credit,false) then
      return s || jsonb_build_object('success',false,'code','RATE_LIMIT_REACHED','error','Tu solicitud gratuita se renueva cada 6 horas. Puedes esperar o usar 1 credito.');
    end if;
    update public.cupos set saldo=saldo-1,updated_at=now() where usuario_id=uid and saldo>=1 returning saldo into balance;
    if not found then
      return jsonb_build_object('success',false,'code','INSUFFICIENT_CREDITS','error','No tienes creditos disponibles. Recarga desde tu perfil.');
    end if;
    charge:=1;
  else balance:=(s->>'balance')::integer;
  end if;
  -- Existing guards enforce owner, availability, rejection cooldown and the 10-person cap.
  insert into public.postulaciones(articulo_id,usuario_id,justificacion)
    values(p_article_id,uid,trim(p_message)) returning id into pid;
  insert into public.donation_application_credits(id,usuario_id,articulo_id,cost,state)
    values(pid,uid,p_article_id,charge,'pending');
  if charge=1 then
    insert into public.cupos_historial(usuario_id,cantidad,concepto,referencia_id)
      values(uid,-1,'solicitud_retenida',pid);
  end if;
  return jsonb_build_object('success',true,'id',pid,'alreadyExists',false,'cost',charge,'balance',balance);
end;
$$;

create or replace function public.settle_donation_on_delete()
returns trigger language plpgsql security definer set search_path='' as $$
declare winner uuid;
begin
  select coalesce(ganador_id,winner_id,recipient_id) into winner from public.articulos where id=old.articulo_id;
  perform public.finish_donation_credit(old.id,case when winner=old.usuario_id then 'chosen'
    when auth.uid()=old.usuario_id then 'withdrawn' else 'refunded' end);
  return old;
end;
$$;
drop trigger if exists settle_donation_credit_delete on public.postulaciones;
create trigger settle_donation_credit_delete after delete on public.postulaciones
for each row execute function public.settle_donation_on_delete();

create or replace function public.settle_donation_on_article()
returns trigger language plpgsql security definer set search_path='' as $$
declare r record; winner uuid;
begin
  if tg_op='UPDATE' then winner:=coalesce(new.ganador_id,new.winner_id,new.recipient_id); end if;
  if tg_op='DELETE' or winner is not null then
    for r in select id,usuario_id from public.donation_application_credits where articulo_id=old.id and state='pending'
    loop
      perform public.finish_donation_credit(r.id,case when tg_op='UPDATE' and winner=r.usuario_id then 'chosen' else 'refunded' end);
    end loop;
  end if;
  if tg_op='DELETE' then return old; else return new; end if;
end;
$$;
drop trigger if exists settle_donation_credit_article_delete on public.articulos;
create trigger settle_donation_credit_article_delete before delete on public.articulos
for each row execute function public.settle_donation_on_article();
drop trigger if exists settle_donation_credit_article_update on public.articulos;
create trigger settle_donation_credit_article_update after update on public.articulos
for each row execute function public.settle_donation_on_article();

-- Only the transaction above may create applications. No client-written quota history.
revoke insert,update on public.postulaciones from anon,authenticated;
revoke insert,update,delete on public.postulacion_historial,public.cupos_extra_donacion from anon,authenticated;
revoke all on function public.finish_donation_credit(uuid,text),public.settle_donation_credits(uuid),
  public.settle_donation_on_delete(),public.settle_donation_on_article() from public,anon,authenticated;
revoke all on function public.apply_for_donation(uuid,text,boolean),public.donation_application_status() from public,anon;
grant execute on function public.apply_for_donation(uuid,text,boolean),public.donation_application_status() to authenticated;
notify pgrst,'reload schema';
commit;
