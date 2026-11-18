begin;

create table if not exists public.account_erasure_settings (
  singleton boolean primary key default true check(singleton),
  enabled boolean not null default false
);
insert into public.account_erasure_settings(singleton) values(true) on conflict do nothing;
alter table public.account_erasure_settings enable row level security;
revoke all on public.account_erasure_settings from public,anon,authenticated;

create table if not exists public.account_erasure_receipts (
  request_id uuid primary key references public.data_rights_requests(id),
  subject_digest text not null,
  erased_at timestamptz not null
);
alter table public.account_erasure_receipts enable row level security;
revoke all on public.account_erasure_receipts from public,anon,authenticated;

alter table public.data_rights_requests add column if not exists erased_at timestamptz;
alter table public.data_rights_requests drop constraint rights_source_check;
alter table public.data_rights_requests add constraint rights_source_check check(
  (erased_at is null and source='web' and user_id is not null and requester_contact is null)
  or (erased_at is null and source='email' and user_id is null and requester_contact is not null
    and length(requester_contact) between 3 and 254)
  or (erased_at is not null and source='web' and user_id is null and requester_contact is null
    and kind='deletion' and status='answered')
);

-- A deliberately narrow first workflow. Preserve records that require a decision.
create or replace function public.account_erasure_blockers(p_user uuid,p_request uuid)
returns text[] language plpgsql stable set search_path='' as $$
declare relation record; linked boolean; blockers text[]:='{}'; account_email text; registered_at timestamptz;
begin
  select email,created_at into account_email,registered_at from auth.users where id=p_user;
  if not found then return array['La cuenta ya no está disponible.']; end if;
  if registered_at is null or registered_at<'2026-11-06 00:00:00+00'::timestamptz then
    blockers:=array_append(blockers,'Cuenta anterior al registro verificable de cargas de imágenes');
  end if;
  if exists(select 1 from public.usuarios where id=p_user and nullif(btrim(foto_url),'') is not null)
    or exists(select 1 from storage.objects o
      where o.name like p_user::text||'/%' or to_jsonb(o)->>'owner_id'=p_user::text or to_jsonb(o)->>'owner'=p_user::text) then
    blockers:=array_append(blockers,'Fotos o archivos asociados');
  end if;
  if exists(select 1 from public.cupos where usuario_id=p_user and saldo is distinct from 0) then
    blockers:=array_append(blockers,'Saldo de créditos');
  end if;
  if exists(select 1 from public.data_rights_requests where user_id=p_user and id<>p_request)
    or exists(select 1 from public.data_rights_requests where source='email'
      and lower(requester_contact)=lower(account_email)) then
    blockers:=array_append(blockers,'Otras solicitudes de datos');
  end if;
  if exists(select 1 from public.recargas_pendientes where lower(email)=lower(account_email)) then
    blockers:=array_append(blockers,'Registros de recargas');
  end if;
  -- Check explicit UUID references, including fields without foreign keys.
  for relation in
    select c.relname as name, string_agg(format('%I=$1',a.attname),' or ' order by a.attnum) as predicate
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    join pg_catalog.pg_attribute a on a.attrelid=c.oid
    where n.nspname='public' and c.relkind in ('r','p') and not c.relispartition
      and a.attnum>0 and not a.attisdropped and a.atttypid='pg_catalog.uuid'::regtype
      and not (c.relname='usuarios' and a.attname='id')
      and not (c.relname='cupos' and a.attname='usuario_id')
      and not (c.relname='legal_consents' and a.attname='user_id')
      and not (c.relname='data_rights_requests' and a.attname='user_id')
    group by c.relname order by c.relname
  loop
    execute format('select exists(select 1 from public.%I where %s)',relation.name,relation.predicate)
      into linked using p_user;
    if linked then blockers:=array_append(blockers,relation.name); end if;
  end loop;
  return blockers;
end;
$$;

create or replace function public.staff_account_erasure(p_request uuid,p_revision integer,p_confirm boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); request public.data_rights_requests%rowtype; blockers text[]; enabled boolean; finished timestamptz;
begin
  perform public.staff_require('account_erasure');
  select * into request from public.data_rights_requests where id=p_request for update;
  if not found or request.kind<>'deletion' or request.source<>'web' then
    raise exception 'La supresión desde el panel requiere un radicado web de cierre.';
  end if;
  if request.erased_at is not null then return jsonb_build_object('erasedAt',request.erased_at); end if;
  if request.status='answered' or request.assigned_to is distinct from actor or request.verification<>'verified'
    or length(btrim(request.internal_notes))<10 then
    raise exception 'Toma el caso y guarda la verificación de identidad antes de continuar.';
  end if;
  if request.work_revision is distinct from p_revision then
    raise exception 'El radicado cambió. Actualiza antes de continuar.';
  end if;
  if request.user_id is null or request.user_id=actor then raise exception 'Esta cuenta no se puede suprimir desde el panel.'; end if;
  select s.enabled into enabled from public.account_erasure_settings s where singleton;
  if p_confirm is true then
    perform public.staff_require_recent_mfa();
    if enabled is distinct from true then raise exception 'La ejecución de supresión está deshabilitada.'; end if;
    -- Serialize account-linked foreign key inserts with the last check and deletion.
    perform 1 from auth.users where id=request.user_id for update;
    perform 1 from public.usuarios where id=request.user_id for update;
    perform 1 from public.cupos where usuario_id=request.user_id for update;
  end if;
  blockers:=public.account_erasure_blockers(request.user_id,p_request);
  if p_confirm is distinct from true or cardinality(blockers)>0 then
    return jsonb_build_object('enabled',coalesce(enabled,false),'blockers',blockers);
  end if;

  finished:=clock_timestamp();
  update public.data_rights_requests set user_id=null,status='answered',erased_at=finished,
    body='Solicitud de cierre y supresión atendida.',response='Se cerró la cuenta y se suprimió el perfil.',
    responded_at=finished,handled_by=actor,internal_notes='',work_revision=work_revision+1 where id=p_request;
  delete from auth.users where id=request.user_id;
  if not found or exists(select 1 from public.usuarios where id=request.user_id)
    or exists(select 1 from auth.sessions where user_id=request.user_id) then
    raise exception 'No fue posible verificar la supresión. No se guardaron cambios.';
  end if;
  insert into public.staff_audit(actor_id,action,target_id,reason,changes)
    values(actor,'privacy.erase_account',p_request,'Supresión de cuenta verificada',jsonb_build_object('erased_at',finished));
  insert into public.account_erasure_receipts(request_id,subject_digest,erased_at)
    values(p_request,encode(sha256(convert_to(request.user_id::text,'UTF8')),'hex'),finished);
  return jsonb_build_object('erasedAt',finished);
end;
$$;

revoke all on function public.account_erasure_blockers(uuid,uuid),public.staff_account_erasure(uuid,integer,boolean) from public,anon,authenticated;
grant execute on function public.staff_account_erasure(uuid,integer,boolean) to authenticated;
notify pgrst,'reload schema';
commit;
