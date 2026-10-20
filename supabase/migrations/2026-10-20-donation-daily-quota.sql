begin;

-- Rolling quota counts receipts, including cancelled/rejected requests. Never resets at midnight.
create or replace function public.donation_application_status()
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); free_at timestamptz; free_used integer; pending integer; balance integer;
begin
  if uid is null then raise exception 'Debes iniciar sesion.' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,1313));
  perform public.settle_donation_credits(uid);
  select count(*),(array_agg(created_at order by created_at desc))[2]+interval '24 hours' into free_used,free_at
    from public.donation_application_credits where usuario_id=uid and cost=0
      and created_at>now()-interval '24 hours';
  select count(*) into pending from public.postulaciones p join public.articulos a on a.id=p.articulo_id
    where p.usuario_id=uid and a.mode='donacion' and a.created_at>now()-interval '60 days'
      and coalesce(a.ganador_id,a.winner_id,a.recipient_id) is null;
  select saldo into balance from public.cupos where usuario_id=uid;
  return jsonb_build_object('balance',coalesce(balance,0),'pending',pending,'maxPending',3,
    'heldCredits',(select coalesce(sum(cost),0) from public.donation_application_credits where usuario_id=uid and state='pending'),
    'freeLimit',2,'freeUsed',free_used,'freeRemaining',greatest(0,2-free_used),
    'freeAvailable',free_used<2,'nextFreeAt',case when free_used>=2 then free_at else null end);
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
      return s || jsonb_build_object('success',false,'code','RATE_LIMIT_REACHED','error','Ya usaste tus 2 postulaciones gratuitas en las ultimas 24 horas. Puedes esperar o confirmar el uso de 1 credito.');
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


revoke all on function public.apply_for_donation(uuid,text,boolean),public.donation_application_status() from public,anon;
grant execute on function public.apply_for_donation(uuid,text,boolean),public.donation_application_status() to authenticated;
notify pgrst,'reload schema';
commit;
