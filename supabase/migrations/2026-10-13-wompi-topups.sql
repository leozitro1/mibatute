begin;

create table if not exists public.wompi_topups (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  reference text not null unique,
  credits integer not null check (credits in (2,5,10)),
  amount_in_cents integer not null check (amount_in_cents=credits*100000),
  currency text not null default 'COP' check (currency='COP'),
  environment text not null check (environment in ('test','prod')),
  state text not null default 'pending' check (state in ('pending','approved')),
  transaction_id text unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '30 minutes',
  credited_at timestamptz
);
create index if not exists wompi_topup_user_idx on public.wompi_topups(usuario_id,environment,created_at desc);
alter table public.wompi_topups enable row level security;
drop policy if exists wompi_topup_own on public.wompi_topups;
create policy wompi_topup_own on public.wompi_topups for select using(usuario_id=auth.uid());
grant select on public.wompi_topups to authenticated;
revoke insert,update,delete on public.wompi_topups from anon,authenticated;

create or replace function public.create_wompi_topup(p_credits integer,p_environment text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); r public.wompi_topups%rowtype;
begin
  if uid is null then raise exception 'Debes iniciar sesion.' using errcode='42501'; end if;
  if p_credits is null or p_credits not in (2,5,10) or p_environment is null or p_environment not in ('test','prod') then
    raise exception 'Paquete de creditos invalido.';
  end if;
  if not exists(select 1 from auth.users where id=uid and email_confirmed_at is not null)
    or exists(select 1 from public.usuarios where id=uid and (is_blocked or bloqueado)) then
    raise exception 'Verifica tu cuenta antes de recargar.' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,1313));
  select * into r from public.wompi_topups where usuario_id=uid and credits=p_credits
    and environment=p_environment and state='pending' and expires_at>now()
    order by created_at desc limit 1;
  if not found then
    insert into public.wompi_topups(usuario_id,reference,credits,amount_in_cents,environment)
      values(uid,'MB-'||gen_random_uuid()::text,p_credits,p_credits*100000,p_environment) returning * into r;
  end if;
  return to_jsonb(r);
end;
$$;

create or replace function public.wompi_topup_status(p_environment text,p_reference text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); r public.wompi_topups%rowtype; balance integer;
begin
  if uid is null then raise exception 'Debes iniciar sesion.' using errcode='42501'; end if;
  select * into r from public.wompi_topups where usuario_id=uid and environment=p_environment
    and (p_reference is null or reference=p_reference) order by created_at desc limit 1;
  select saldo into balance from public.cupos where usuario_id=uid;
  return jsonb_build_object('order',case when r.id is null then null else to_jsonb(r) end,'balance',coalesce(balance,0));
end;
$$;

create or replace function public.credit_wompi_topup(p_reference text,p_transaction_id text,p_amount integer,p_currency text,p_environment text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.wompi_topups%rowtype; uid uuid; balance integer;
begin
  select usuario_id into uid from public.wompi_topups where reference=p_reference;
  if uid is null then raise exception 'Referencia de recarga desconocida.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,1313));
  select * into r from public.wompi_topups where reference=p_reference for update;
  if r.amount_in_cents is distinct from p_amount or r.currency is distinct from p_currency
    or r.environment is distinct from p_environment or coalesce(p_transaction_id,'')='' then
    raise exception 'El pago no corresponde a esta recarga.';
  end if;
  if r.state='approved' then
    if r.transaction_id is distinct from p_transaction_id then raise exception 'La referencia ya tiene otro pago.'; end if;
    select saldo into balance from public.cupos where usuario_id=uid;
    return jsonb_build_object('credited',false,'balance',coalesce(balance,0));
  end if;
  -- Sandbox payments never create spendable credits on a cloud database.
  if p_environment='prod' or current_setting('app.settings.wompi_test_credits',true)='on' then
    insert into public.cupos(usuario_id,saldo) values(uid,r.credits)
      on conflict(usuario_id) do update set saldo=public.cupos.saldo+excluded.saldo,updated_at=now();
    insert into public.cupos_historial(usuario_id,cantidad,concepto,referencia_id)
      values(uid,r.credits,'recarga_wompi',r.id);
  end if;
  update public.wompi_topups set state='approved',transaction_id=p_transaction_id,credited_at=now() where id=r.id;
  select saldo into balance from public.cupos where usuario_id=uid;
  return jsonb_build_object('credited',true,'balance',coalesce(balance,0));
end;
$$;

revoke all on function public.credit_wompi_topup(text,text,integer,text,text) from public,anon,authenticated;
grant execute on function public.credit_wompi_topup(text,text,integer,text,text) to service_role;
revoke all on function public.create_wompi_topup(integer,text),public.wompi_topup_status(text,text) from public,anon;
grant execute on function public.create_wompi_topup(integer,text),public.wompi_topup_status(text,text) to authenticated;
grant all on public.wompi_topups to service_role;
notify pgrst,'reload schema';
commit;
