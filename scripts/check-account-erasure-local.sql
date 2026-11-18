\set ON_ERROR_STOP on
begin;
-- Run only against the disposable local database. All changes are rolled back.

do $test$
declare
  target uuid:=gen_random_uuid(); with_balance uuid:=gen_random_uuid();
  supervisor uuid:=gen_random_uuid(); ordinary uuid:=gen_random_uuid();
  supervisor_session uuid:=gen_random_uuid(); ordinary_session uuid:=gen_random_uuid();
  target_session uuid:=gen_random_uuid();
  request uuid:=gen_random_uuid(); blocked_request uuid:=gen_random_uuid(); result jsonb; consent bigint;
  version text:='erasure-fixture-'||gen_random_uuid(); acceptance jsonb;
  amr jsonb:=jsonb_build_array(jsonb_build_object('method','totp','timestamp',extract(epoch from now())::bigint));
begin
  if has_function_privilege('anon','public.staff_account_erasure(uuid,integer,boolean)','execute') then
    raise exception 'La función permite ejecución anónima';
  end if;
  insert into public.legal_releases(version,enabled,documents) values(version,true,
    jsonb_build_object('version',version,'operator',
      '{"name":"Operador ficticio","entityType":"natural","address":"Dirección de prueba","phone":"0000000000","nit":"0000-0","email":"ops@example.com","dataEmail":"ops@example.com"}'::jsonb,
      'policies','{"/terminos":{},"/privacidad":{},"/pagos":{}}'::jsonb));
  acceptance:=jsonb_build_object('legal_acceptance',jsonb_build_object('terms_version',version,'privacy_version',version,
    'terms_accepted',true,'privacy_accepted',true,'adult_confirmed',true));
  insert into auth.users(id,email,created_at,raw_user_meta_data)
    select id,'erasure-'||id||'@example.com',now(),acceptance from unnest(array[target,with_balance,supervisor,ordinary]) as u(id);
  insert into public.usuarios(id,nombre)
    select id,'Cuenta ficticia' from unnest(array[target,with_balance,supervisor,ordinary]) as u(id) on conflict(id) do nothing;
  insert into auth.sessions(id,user_id) values(supervisor_session,supervisor),(ordinary_session,ordinary),(target_session,target);
  insert into auth.mfa_factors(id,user_id,status,factor_type,created_at,updated_at)
    values(gen_random_uuid(),supervisor,'verified','totp',now(),now()),(gen_random_uuid(),ordinary,'verified','totp',now(),now());
  insert into public.staff_accounts(user_id,role) values(supervisor,'master'),(ordinary,'admin');
  insert into public.staff_sessions(session_id,user_id) values(supervisor_session,supervisor),(ordinary_session,ordinary);
  insert into public.cupos(usuario_id,saldo) values(target,0),(with_balance,3)
    on conflict(usuario_id) do update set saldo=excluded.saldo;
  select id into strict consent from public.legal_consents where user_id=target;
  insert into public.data_rights_requests(id,user_id,kind,body,assigned_to,verification,internal_notes,work_revision) values
    (request,target,'deletion','Solicitud ficticia de cierre.',supervisor,'verified','Identidad ficticia verificada.',1),
    (blocked_request,with_balance,'deletion','Solicitud ficticia de cierre.',supervisor,'verified','Identidad ficticia verificada.',1);

  perform set_config('request.jwt.claim.sub',ordinary::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',ordinary,'aal','aal2','session_id',ordinary_session,'amr',amr)::text,true);
  begin
    perform public.staff_account_erasure(request,1,false);
    raise exception 'Admin ordinario pudo consultar';
  exception when insufficient_privilege then null;
  end;

  perform set_config('request.jwt.claim.sub',supervisor::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',supervisor,'aal','aal2','session_id',supervisor_session)::text,true);
  result:=public.staff_account_erasure(request,1,false);
  if (result - 'closureKind' - 'sanctionExpiresAt' - 'requiresSanctionReview') is distinct from '{"enabled":false,"blockers":[]}'::jsonb then raise exception 'Vista previa inesperada: %',result; end if;
  begin
    perform public.staff_account_erasure(request,1,true);
    raise exception 'Ejecución sin MFA reciente';
  exception when insufficient_privilege then null;
  end;

  perform set_config('request.jwt.claims',jsonb_build_object('sub',supervisor,'aal','aal2','session_id',supervisor_session,'amr',amr)::text,true);
  begin
    perform public.staff_account_erasure(request,1,true);
    raise exception 'Ejecución con el interruptor apagado';
  exception when raise_exception then
    if sqlerrm not like '%deshabilitada%' then raise; end if;
  end;
  update public.account_erasure_settings set enabled=true;
  begin
    perform public.staff_account_erasure(request,0,true);
    raise exception 'Se aceptó una versión obsoleta del radicado';
  exception when raise_exception then
    if sqlerrm not like '%radicado cambió%' then raise; end if;
  end;
  result:=public.staff_account_erasure(blocked_request,1,true);
  if not (result->'blockers' ? 'Saldo de créditos') or not exists(select 1 from auth.users where id=with_balance) then
    raise exception 'Falló la protección del saldo';
  end if;

  result:=public.staff_account_erasure(request,1,true);
  if result->>'erasedAt' is null
    or exists(select 1 from auth.users where id=target)
    or exists(select 1 from public.usuarios where id=target)
    or exists(select 1 from auth.sessions where user_id=target)
    or not exists(select 1 from public.data_rights_requests where id=request and user_id is null and status='answered' and erased_at is not null)
    or not exists(select 1 from public.legal_consents where id=consent and user_id is null)
    or not exists(select 1 from public.account_erasure_receipts where request_id=request and length(subject_digest)=64)
    or public.staff_account_erasure(request,1,true) is distinct from result then
    raise exception 'Falló la comprobación del borrado o el reintento';
  end if;
  insert into auth.users(id,email,created_at,raw_user_meta_data)
    values(gen_random_uuid(),'erasure-'||target||'@example.com',now(),acceptance);
  raise notice 'Supresión ficticia verificada. Cuenta, perfil y sesiones eliminados. Radicado, consentimiento sin vínculo y constancia conservados.';
end;
$test$;
rollback;
