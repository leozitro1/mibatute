begin;

create or replace function public.staff_compensate_credits(p_user uuid,p_amount integer,p_reason text,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare reason text:=trim(coalesce(p_reason,'')); previous public.staff_audit%rowtype;
  balance integer;message_id uuid;result jsonb;
begin
  perform public.staff_require('users');
  if p_user=auth.uid() then raise exception 'No puedes compensar tu propia cuenta.'; end if;
  if p_amount is null or p_amount not between 1 and 3 then raise exception 'Puedes agregar entre 1 y 3 creditos por compensacion.'; end if;
  if length(reason) not between 8 and 500 then raise exception 'Indica un motivo de 8 a 500 caracteres.'; end if;
  if p_request_id is null then raise exception 'La solicitud no es valida.'; end if;
  -- A retry must not repeat the balance change, ledger entry or inbox notice.
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,20261015));
  select * into previous from public.staff_audit where id=p_request_id;
  if found then
    if previous.action is distinct from 'user.credit_compensation' or previous.actor_id is distinct from auth.uid()
      or previous.target_id is distinct from p_user or previous.reason is distinct from reason
      or previous.changes->>'amount' is distinct from p_amount::text then
      raise exception 'Esta solicitud ya se uso con otros datos. Cierra y vuelve a abrir la compensacion.';
    end if;
    return previous.changes->'result';
  end if;
  perform 1 from public.usuarios where id=p_user for update;
  if not found then raise exception 'El usuario ya no existe.'; end if;
  insert into public.cupos(usuario_id,saldo) values(p_user,p_amount)
    on conflict(usuario_id) do update set saldo=public.cupos.saldo+excluded.saldo,updated_at=now() returning saldo into balance;
  insert into public.cupos_historial(usuario_id,cantidad,concepto,referencia_id)
    values(p_user,p_amount,'compensacion_administrativa',p_request_id);
  insert into public.system_messages(sender_id,title,body) values(auth.uid(),'Creditos de compensacion',
    concat('El equipo de MiBatute agrego ',p_amount,case when p_amount=1 then ' credito' else ' creditos' end,' a tu cuenta como compensacion.',
      E'\nMotivo: ',reason,E'\nSaldo despues de la compensacion: ',balance,' creditos.')) returning id into message_id;
  insert into public.system_message_receipts(message_id,user_id) values(message_id,p_user);
  result:=jsonb_build_object('success',true,'id',p_user,'balance',balance,'amount',p_amount,
    'notice','Compensación aplicada. El usuario recibió el motivo y los créditos en su buzón.');
  insert into public.staff_audit(id,actor_id,action,target_id,reason,changes)
    values(p_request_id,auth.uid(),'user.credit_compensation',p_user,reason,
      jsonb_build_object('amount',p_amount,'balance_before',balance-p_amount,'balance_after',balance,'message_id',message_id,'result',result));
  return result;
end;
$$;
revoke all on function public.staff_compensate_credits(uuid,integer,text,uuid) from public,anon;
grant execute on function public.staff_compensate_credits(uuid,integer,text,uuid) to authenticated;
-- Validate supplied registration phone metadata without touching existing accounts.
create or replace function public.validate_registration_mobile() returns trigger
language plpgsql set search_path='' as $$
begin
 if coalesce(new.raw_user_meta_data,'{}'::jsonb) ? 'movil'
  and coalesce(new.raw_user_meta_data->>'movil','') !~ '^[0-9]{10}$' then
  raise exception 'El celular debe tener exactamente 10 dígitos, sin indicativo de país.' using errcode='23514';
 end if;
 return new;
end $$;
revoke all on function public.validate_registration_mobile() from public,anon,authenticated;
drop trigger if exists validate_registration_mobile on auth.users;
create trigger validate_registration_mobile before insert on auth.users
 for each row execute function public.validate_registration_mobile();
notify pgrst,'reload schema';
commit;
