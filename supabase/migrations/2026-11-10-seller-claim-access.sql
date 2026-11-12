begin;

alter table public.seller_registration_settings add column if not exists claims_enabled boolean not null default false;

create or replace function public.staff_seller_claim_lookup(p_thread uuid,p_article uuid,p_evidence_seq bigint,
  p_categories text[],p_verified boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare seller public.seller_registrations%rowtype;
begin
  perform public.staff_require('seller_claims');
  perform public.staff_require_recent_mfa();
  if not exists(select 1 from public.seller_registration_settings where enabled and claims_enabled) then
    raise exception 'La consulta de vendedores por reclamo no está habilitada.' using errcode='P0001';
  end if;
  if p_verified is distinct from true or p_thread is null or p_article is null or coalesce(p_evidence_seq,0)<1
    or coalesce(cardinality(p_categories),0) not between 1 and 4 or array_ndims(p_categories) is distinct from 1
    or array_position(p_categories,null) is not null
    or not p_categories <@ array['name','document','address','phone']::text[]
    or (select count(distinct category) from unnest(p_categories) as u(category))<>cardinality(p_categories) then
    raise exception 'Confirma la evidencia y selecciona los datos necesarios.' using errcode='22023';
  end if;

  -- Staff verify the purchase outside the platform. The message anchors the request in Support.
  select s.* into seller
  from public.support_threads t
  join public.support_messages m on m.thread_id=t.id and m.seq=p_evidence_seq
    and m.author_role='user' and m.sender_id=t.user_id
  join public.articulos a on a.id=p_article and a.mode='venta'
  join public.seller_registrations s on s.user_id=coalesce(a.owner_id,a.usuario_id)
    and s.user_id<>t.user_id
  where t.id=p_thread and t.closed_at is null and t.user_hidden_at is null
  for share of t,a,s;
  if not found then
    raise exception 'No se encontró un registro de vendedor aplicable a esta solicitud.' using errcode='P0001';
  end if;

  insert into public.staff_audit(actor_id,action,target_id,reason,changes)
  values(auth.uid(),'seller_claim.lookup',p_thread,'Consulta de identificación con compra verificada por el equipo',
    jsonb_build_object('article_id',p_article,'evidence_seq',p_evidence_seq,'categories',p_categories));
  return jsonb_strip_nulls(jsonb_build_object(
    'legalName',case when 'name'=any(p_categories) then seller.legal_name end,
    'documentType',case when 'document'=any(p_categories) then seller.document_type end,
    'documentNumber',case when 'document'=any(p_categories) then seller.document_number end,
    'notificationAddress',case when 'address'=any(p_categories) then seller.notification_address end,
    'phone',case when 'phone'=any(p_categories) then seller.phone end));
end;
$$;

revoke all on function public.staff_seller_claim_lookup(uuid,uuid,bigint,text[],boolean) from public,anon,authenticated;
grant execute on function public.staff_seller_claim_lookup(uuid,uuid,bigint,text[],boolean) to authenticated;
notify pgrst,'reload schema';
commit;
