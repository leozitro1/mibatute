begin;

-- Optional bundle: keep the original three-argument API and both existing ledgers.
-- The shared owner lock, balance check and both operations live in one transaction.
create or replace function public.publish_article_with_credit(p_article jsonb,p_request_id uuid,p_use_credit boolean,p_feature boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); quote jsonb; result jsonb; featured jsonb;
  publication_cost integer:=0; feature_cost integer:=case when coalesce(p_feature,false) then 1 else 0 end; balance integer;
begin
  if uid is null then raise exception 'Debes iniciar sesion.' using errcode='42501';end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,1313));
  -- A retry must never charge, feature or recreate an already committed request.
  if exists(select 1 from public.article_publication_credits where article_id=p_request_id) then
    return public.publish_article_with_credit(p_article,p_request_id,p_use_credit)||jsonb_build_object('publicationCost',0,'featureCost',0);
  end if;
  if not coalesce(p_feature,false) then
    return public.publish_article_with_credit(p_article,p_request_id,p_use_credit)||jsonb_build_object('featureCost',0);
  end if;
  quote:=public.sale_publication_status();
  if p_article->>'mode'='venta' and (quote->>'requiresCredit')::boolean then
    publication_cost:=1;
    if not coalesce(p_use_credit,false) then
      return quote||jsonb_build_object('success',false,'code','PUBLICATION_CREDIT_REQUIRED','error','Confirma el uso de 1 credito para publicar otra venta.');
    end if;
  end if;
  select saldo into balance from public.cupos where usuario_id=uid for update;
  balance:=coalesce(balance,0);
  if balance<publication_cost+feature_cost then
    return quote||jsonb_build_object('success',false,'code','INSUFFICIENT_CREDITS','balance',balance,
      'publicationCost',publication_cost,'featureCost',feature_cost,'error','No tienes saldo suficiente para publicar y destacar. Puedes quitar el destacado antes de continuar.');
  end if;
  result:=public.publish_article_with_credit(p_article,p_request_id,p_use_credit);
  if not coalesce((result->>'success')::boolean,false) then return result;end if;
  featured:=public.feature_article(p_request_id);
  return result||jsonb_build_object('article',featured->'article','balance',featured->'balance',
    'publicationCost',publication_cost,'featureCost',feature_cost,'cost',publication_cost+feature_cost);
end;
$$;
revoke all on function public.publish_article_with_credit(jsonb,uuid,boolean,boolean) from public,anon;
grant execute on function public.publish_article_with_credit(jsonb,uuid,boolean,boolean) to authenticated;
notify pgrst,'reload schema';
commit;
