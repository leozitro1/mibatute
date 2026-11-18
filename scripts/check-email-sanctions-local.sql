\set ON_ERROR_STOP on
begin;
-- Run only against the disposable local database. All changes are rolled back.

do $test$
declare
  target uuid:=gen_random_uuid(); with_balance uuid:=gen_random_uuid();
  supervisor uuid:=gen_random_uuid(); ordinary uuid:=gen_random_uuid();
  supervisor_session uuid:=gen_random_uuid(); ordinary_session uuid:=gen_random_uuid();
  target_session uuid:=gen_random_uuid();
  request uuid:=gen_random_uuid(); blocked_request uuid:=gen_random_uuid(); result jsonb; consent bigint; saved_email text; renewed uuid:=gen_random_uuid();
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


  saved_email:='erasure-'||target||'@example.com';
  perform set_config('request.jwt.claim.sub',ordinary::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',ordinary,'aal','aal2','session_id',ordinary_session,'amr',amr)::text,true);
  begin
    perform public.staff_email_sanction(saved_email,'lookup');
    raise exception 'Admin ordinario pudo consultar sanciones';
  exception when insufficient_privilege then null; end;

  perform set_config('request.jwt.claim.sub',supervisor::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',supervisor,'aal','aal2','session_id',supervisor_session)::text,true);
  begin
    perform public.staff_email_sanction(saved_email,'lookup');
    raise exception 'Se omitió el segundo factor reciente';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',supervisor,'aal','aal2','session_id',supervisor_session,'amr',amr)::text,true);
  begin
    perform public.staff_email_sanction(saved_email,'block','Sanción ficticia documentada',now()+interval '1 day');
    raise exception 'Cuenta activa sancionada sin bloqueo previo';
  exception when raise_exception then
    if sqlerrm not like '%Primero registra%' then raise; end if;
  end;
  perform public.staff_block_user(target,'Bloqueo ficticio por incumplimiento');
  update public.account_erasure_settings set enabled=true;
  result:=public.staff_account_erasure(request,1,false);
  if not (result->>'requiresSanctionReview')::boolean then raise exception 'Falta aviso de revisión de sanción'; end if;
  begin
    perform public.staff_account_erasure(request,1,true);
    raise exception 'Borrado bloqueado pudo eludir revisión de sanción';
  exception when raise_exception then
    if sqlerrm not like '%Registra la sanción%' then raise; end if;
  end;
  result:=public.staff_email_sanction(upper(saved_email),'block','Sanción ficticia documentada',now()+interval '1 day');
  if not (result->>'active')::boolean then raise exception 'Sanción no creada'; end if;
  if has_table_privilege('authenticated','public.email_sanctions','SELECT')
    or has_table_privilege('anon','public.email_sanction_key','SELECT')
    or has_function_privilege('authenticated','public.sanction_email_digest(text)','EXECUTE')
    or has_function_privilege('authenticated','public.staff_account_erasure_base(uuid,integer,boolean)','EXECUTE')
    then raise exception 'Exposición de datos o de la ruta de borrado interna'; end if;
  begin
    update auth.users set email='other-'||target||'@example.com' where id=target;
    raise exception 'Sanción evadida cambiando el correo';
  exception when raise_exception then
    if sqlerrm not like '%sanción de registro vigente%' then raise; end if;
  end;
  begin
    update auth.users set email=null where id=target;
    raise exception 'Sanción evadida vaciando el correo';
  exception when raise_exception then
    if sqlerrm not like '%sanción de registro vigente%' then raise; end if;
  end;
  result:=public.staff_account_erasure(request,1,true);
  if result->>'erasedAt' is null or result->>'closureKind'<>'sanctioned'
    or exists(select 1 from auth.users where id=target)
    or public.staff_account_erasure(request,1,true) is distinct from result
    then raise exception 'Cierre sancionado o reintento incorrecto'; end if;
  begin
    insert into auth.users(id,email,created_at,raw_user_meta_data)
      values(renewed,upper(saved_email),now(),acceptance);
    raise exception 'El correo sancionado pudo registrarse';
  exception when raise_exception then
    if sqlerrm not like '%No se puede registrar%' then raise; end if;
  end;
  result:=public.staff_email_sanction(saved_email,'lookup');
  if not (result->>'active')::boolean then raise exception 'La sanción desapareció con la cuenta'; end if;
  perform public.staff_email_sanction(saved_email,'revoke','Revisión ficticia favorable');
  insert into auth.users(id,email,created_at,raw_user_meta_data)
    values(renewed,saved_email,now(),acceptance);
  -- Expired sanctions stop blocking registration.
  update public.email_sanctions set revoked_at=null,imposed_at=now()-interval '2 days',expires_at=now()-interval '1 day'
    where email_digest=public.sanction_email_digest(saved_email);
  delete from auth.users where id=renewed;
  insert into auth.users(id,email,created_at,raw_user_meta_data)
    values(gen_random_uuid(),saved_email,now(),acceptance);
  raise notice 'Sanción local verificada: permisos, MFA, bloqueo previo, huella privada, cierre, reintento, nuevo registro, revisión y vencimiento.';
end;
$test$;
rollback;
