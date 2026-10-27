begin;
-- Preserve legacy order totals; only the creation RPC quotes the current packages.
alter table public.wompi_topups drop constraint if exists wompi_topups_credits_check;
alter table public.wompi_topups drop constraint if exists wompi_topups_amount_in_cents_check;
alter table public.wompi_topups drop constraint if exists wompi_topups_check;
alter table public.wompi_topups add constraint wompi_topups_credits_check check(credits in (1,2,3,5,10));
alter table public.wompi_topups add constraint wompi_topups_amount_in_cents_check
 check((credits,amount_in_cents) in ((1,250000),(3,700000),(5,1100000),(2,200000),(5,500000),(10,1000000)));
alter table public.wompi_topups drop constraint if exists wompi_topups_state_check;
alter table public.wompi_topups add constraint wompi_topups_state_check check(state in ('pending','approved','declined','voided','error'));
create or replace function public.wompi_record_failure(p_reference text,p_transaction_id text,p_status text,p_environment text)
returns void language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
 if p_status is null or p_status not in ('DECLINED','VOIDED','ERROR') or coalesce(p_transaction_id,'')='' then raise exception 'Estado no válido.';end if;
 select usuario_id into target from public.wompi_topups where reference=p_reference and environment=p_environment;
 if target is null then raise exception 'Recarga no encontrada.';end if;
 perform pg_advisory_xact_lock(hashtextextended(target::text,1313));
 update public.wompi_topups set state=lower(p_status),transaction_id=p_transaction_id where reference=p_reference and environment=p_environment and state='pending';
end $$;
revoke all on function public.wompi_record_failure(text,text,text,text) from public,anon,authenticated;
grant execute on function public.wompi_record_failure(text,text,text,text) to service_role;
create or replace function public.create_wompi_topup(p_credits integer,p_environment text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); r public.wompi_topups%rowtype; amount integer;
begin
  if uid is null then raise exception 'Debes iniciar sesion.' using errcode='42501'; end if;
  if p_credits is null or p_credits not in (1,3,5) or p_environment is null or p_environment not in ('test','prod') then
    raise exception 'Paquete de creditos invalido.';
  end if;
  if not exists(select 1 from auth.users where id=uid and email_confirmed_at is not null)
    or exists(select 1 from public.usuarios where id=uid and (is_blocked or bloqueado)) then
    raise exception 'Verifica tu cuenta antes de recargar.' using errcode='42501';
  end if;
  amount:=case p_credits when 1 then 250000 when 3 then 700000 when 5 then 1100000 end;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,1313));
  select * into r from public.wompi_topups where usuario_id=uid and credits=p_credits
    and environment=p_environment and amount_in_cents=amount and state='pending' and expires_at>now()
    order by created_at desc limit 1;
  if not found then
    insert into public.wompi_topups(usuario_id,reference,credits,amount_in_cents,environment)
      values(uid,'MB-'||gen_random_uuid()::text,p_credits,amount,p_environment) returning * into r;
  end if;
  return to_jsonb(r);
end;
$$;

revoke all on function public.create_wompi_topup(integer,text) from public,anon;
grant execute on function public.create_wompi_topup(integer,text) to authenticated;
-- Attach the optional email event when its module is already installed; Sandbox still does not send purchase emails.
do $$ begin
 if to_regprocedure('public.capture_credit_email()') is not null then
  execute 'drop trigger if exists email_topup_event on public.wompi_topups';
  execute 'create trigger email_topup_event after update on public.wompi_topups for each row execute function public.capture_credit_email()';
 end if;
end $$;
-- A newly installed production payment table must retain the existing legal guard.
-- Local Sandbox keeps the explicitly authorized test-credit exception.
do $$ begin
 if to_regprocedure('public.guard_legal_topup()') is not null
  and current_setting('app.settings.wompi_test_credits',true) is distinct from 'on' then
  alter table public.wompi_topups add column if not exists legal_version text references public.legal_releases(version);
  alter table public.wompi_topups add column if not exists legal_accepted_at timestamptz;
  drop trigger if exists guard_legal_topup on public.wompi_topups;
  create trigger guard_legal_topup before insert on public.wompi_topups for each row execute function public.guard_legal_topup();
 end if;
end $$;
notify pgrst,'reload schema';
commit;
