begin;

create table public.email_sanction_key (
  singleton boolean primary key default true check(singleton),
  secret bytea not null default extensions.gen_random_bytes(32)
);
insert into public.email_sanction_key(singleton) values(true);
create table public.email_sanctions (
  id uuid primary key default gen_random_uuid(),
  email_digest bytea not null unique,
  reason text not null check(length(btrim(reason)) between 10 and 500),
  imposed_at timestamptz not null default now(),
  expires_at timestamptz not null,
  imposed_by uuid,
  revoked_at timestamptz,
  check(expires_at>imposed_at)
);
alter table public.email_sanction_key enable row level security;
alter table public.email_sanctions enable row level security;
revoke all on public.email_sanction_key,public.email_sanctions from public,anon,authenticated;

create function public.sanction_email_digest(p_email text)
returns bytea language sql stable security definer set search_path='' as $$
  select extensions.hmac(convert_to(lower(btrim(p_email)),'UTF8'),secret,'sha256')
    from public.email_sanction_key where singleton;
$$;

create function public.guard_email_sanction()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE' and lower(btrim(new.email)) is not distinct from lower(btrim(old.email)) then return new; end if;
  if tg_op='UPDATE' and old.email is distinct from new.email
    and exists(select 1 from public.email_sanctions where email_digest=public.sanction_email_digest(old.email)
      and revoked_at is null and expires_at>now()) then
    raise exception 'La cuenta tiene una sanción de registro vigente. Solicita su revisión.' using errcode='P0001';
  end if;
  if nullif(btrim(new.email),'') is null then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended(lower(btrim(new.email)),9317));
  if exists(select 1 from public.email_sanctions
      where email_digest=public.sanction_email_digest(new.email)
        and revoked_at is null and expires_at>now()) then
    raise exception 'No se puede registrar esta cuenta. Contacta al canal de atención.' using errcode='P0001';
  end if;
  return new;
end;
$$;
create trigger guard_email_sanction before insert or update of email on auth.users
  for each row execute function public.guard_email_sanction();

create function public.staff_email_sanction(p_email text,p_action text default 'lookup',
  p_reason text default '',p_expires_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare account auth.users%rowtype; entry public.email_sanctions%rowtype; digest bytea; profile public.usuarios%rowtype;
begin
  perform public.staff_require('account_erasure');
  perform public.staff_require_recent_mfa();
  if nullif(btrim(p_email),'') is null or length(p_email)>254 or position('@' in p_email)<2 then
    raise exception 'Escribe un correo válido.';
  end if;
  if p_action not in ('lookup','block','revoke') or p_action is null then raise exception 'Acción no válida.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(lower(btrim(p_email)),9317));
  digest:=public.sanction_email_digest(p_email);
  select * into entry from public.email_sanctions where email_digest=digest for update;
  if p_action<>'lookup' then
    if p_reason is null or length(btrim(p_reason)) not between 10 and 500 then
      raise exception 'Registra un motivo de 10 a 500 caracteres.';
    end if;
    if p_action='block' then
      if p_expires_at is null or not isfinite(p_expires_at) or p_expires_at<=now() then raise exception 'Indica el vencimiento futuro de la sanción.'; end if;
      select * into account from auth.users where lower(btrim(email))=lower(btrim(p_email)) for update;
      if not found or account.id=auth.uid() or exists(select 1 from public.staff_accounts where user_id=account.id) then
        raise exception 'Selecciona una cuenta existente que no sea del equipo administrativo.';
      end if;
      select * into profile from public.usuarios where id=account.id for update;
      if not found or not(coalesce(profile.is_blocked,false) or coalesce(profile.bloqueado,false)) then
        raise exception 'Primero registra el bloqueo de la cuenta desde Usuarios.';
      end if;
      insert into public.email_sanctions(email_digest,reason,expires_at,imposed_by)
        values(digest,btrim(p_reason),p_expires_at,auth.uid())
        on conflict(email_digest) do update set reason=excluded.reason,expires_at=excluded.expires_at,
          imposed_at=now(),imposed_by=excluded.imposed_by,revoked_at=null returning * into entry;
    else
      if entry.id is null then raise exception 'No hay una sanción de correo registrada.'; end if;
      update public.email_sanctions set revoked_at=now() where id=entry.id returning * into entry;
    end if;
    insert into public.staff_audit(actor_id,action,target_id,reason,changes)
      values(auth.uid(),'user.email_sanction_'||p_action,entry.id,btrim(p_reason),
        jsonb_build_object('expires_at',entry.expires_at));
  end if;
  return jsonb_build_object('active',entry.id is not null and entry.revoked_at is null and entry.expires_at>now(),
    'reason',entry.reason,'imposedAt',entry.imposed_at,'expiresAt',entry.expires_at,'revokedAt',entry.revoked_at);
end;
$$;

-- Keep the restricted moderation evidence when closing a sanctioned account.
alter function public.account_erasure_blockers(uuid,uuid) rename to account_erasure_blockers_base;
revoke all on function public.account_erasure_blockers_base(uuid,uuid) from public,anon,authenticated;
create function public.account_erasure_blockers(p_user uuid,p_request uuid)
returns text[] language plpgsql stable security definer set search_path='' as $$
declare blockers text[];
begin
  blockers:=public.account_erasure_blockers_base(p_user,p_request);
  -- These recipient-owned inbox rows already cascade with auth.users.
  if not exists(select 1 from public.activity_notifications where recipient_id is distinct from p_user
    and p_user in (articulo_id,chat_id,buyer_id,receipt_id)) then
    blockers:=array_remove(blockers,'activity_notifications');
  end if;
  if not exists(select 1 from public.system_message_receipts where user_id is distinct from p_user
    and p_user in (id,message_id)) then
    blockers:=array_remove(blockers,'system_message_receipts');
  end if;
  if blockers @> array['staff_audit']
    and exists(select 1 from auth.users a join public.email_sanctions s
      on s.email_digest=public.sanction_email_digest(a.email)
      where a.id=p_user and s.revoked_at is null and s.expires_at>now())
    and not exists(select 1 from public.staff_audit where actor_id=p_user
      or (target_id=p_user and action not like 'user.%')) then
    blockers:=array_remove(blockers,'staff_audit');
  end if;
  return blockers;
end;
$$;
revoke all on function public.account_erasure_blockers(uuid,uuid) from public,anon,authenticated;

alter table public.account_erasure_receipts
  add column closure_kind text not null default 'voluntary' check(closure_kind in ('voluntary','sanctioned')),
  add column sanction_expires_at timestamptz;

-- Preserve the existing reviewed erasure transaction, including its off switch.
alter function public.staff_account_erasure(uuid,integer,boolean) rename to staff_account_erasure_base;
revoke all on function public.staff_account_erasure_base(uuid,integer,boolean) from public,anon,authenticated;
create function public.staff_account_erasure(p_request uuid,p_revision integer,p_confirm boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare target uuid; email text; blocked boolean; sanction_until timestamptz; result jsonb; receipt public.account_erasure_receipts%rowtype;
begin
  perform public.staff_require('account_erasure');
  select user_id into target from public.data_rights_requests where id=p_request for update;
  select * into receipt from public.account_erasure_receipts where request_id=p_request;
  if found then
    return jsonb_build_object('erasedAt',receipt.erased_at,'closureKind',receipt.closure_kind,
      'sanctionExpiresAt',receipt.sanction_expires_at,'requiresSanctionReview',false);
  end if;
  select a.email into email from auth.users a where id=target for update;
  select coalesce(is_blocked,false) or coalesce(bloqueado,false) into blocked from public.usuarios where id=target;
  select expires_at into sanction_until from public.email_sanctions
    where email_digest=public.sanction_email_digest(email) and revoked_at is null and expires_at>now();
  if p_confirm and blocked and sanction_until is null then
    raise exception 'La cuenta está bloqueada. Registra la sanción del correo con su vencimiento o revisa el bloqueo antes de suprimirla.';
  end if;
  result:=public.staff_account_erasure_base(p_request,p_revision,p_confirm);
  if result->>'erasedAt' is not null then
    update public.account_erasure_receipts set
      closure_kind=case when sanction_until is null then 'voluntary' else 'sanctioned' end,
      sanction_expires_at=sanction_until where request_id=p_request;
  end if;
  return result||jsonb_build_object('closureKind',case when sanction_until is null then 'voluntary' else 'sanctioned' end,
    'sanctionExpiresAt',sanction_until,'requiresSanctionReview',coalesce(blocked,false) and sanction_until is null);
end;
$$;
revoke all on function public.sanction_email_digest(text),public.guard_email_sanction(),
  public.staff_email_sanction(text,text,text,timestamptz),public.staff_account_erasure(uuid,integer,boolean)
  from public,anon,authenticated;
grant execute on function public.staff_email_sanction(text,text,text,timestamptz),
  public.staff_account_erasure(uuid,integer,boolean) to authenticated;
notify pgrst,'reload schema';
commit;
