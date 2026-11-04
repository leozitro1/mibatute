begin;
-- Extend the installed catalog query without replacing its search, page sizes,
-- ranking or RLS. The owner check runs before featured selection and pagination.
do $$
declare definition text; anchor text:=$anchor$where a.created_at > now() - interval '1440 hours'$anchor$;
begin
 select pg_get_functiondef('public.home_article_page(jsonb,integer)'::regprocedure) into definition;
 if position('onlyVerified' in definition)>0 then return;end if;
 if position(anchor in definition)=0 then raise exception 'La consulta del catálogo cambió; revisar antes de aplicar el filtro.';end if;
 definition:=replace(definition,anchor,anchor||$filter$
      and (not coalesce((p_filters->>'onlyVerified')::boolean,false)
        or public.account_is_verified(coalesce(a.usuario_id,a.owner_id)))$filter$);
 execute definition;
end $$;
notify pgrst,'reload schema';
commit;
