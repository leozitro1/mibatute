begin;
-- Filter before counting/ranking/pagination; retain the installed catalog's RLS and visibility rules.
do $migration$
declare
 definition text;
 city_anchor text:=$anchor$a.city = coalesce(p_filters->>'city', 'Bogotá')$anchor$;
 total_anchor text:=$anchor$'total', total$anchor$;
begin
 select pg_get_functiondef('public.home_article_page(jsonb,integer)'::regprocedure) into definition;
 if strpos(definition,'seller_catalog_v1')>0 then return;end if;
 if strpos(definition,city_anchor)=0 or strpos(definition,total_anchor)=0 then
  raise exception 'La consulta del catálogo cambió; revisar antes de filtrar por vendedor.';
 end if;
 definition:=replace(definition,city_anchor,$replacement$
 ( -- seller_catalog_v1
   (nullif(p_filters->>'sellerId','') is null and a.city = coalesce(p_filters->>'city', 'Bogotá'))
   or (nullif(p_filters->>'sellerId','') is not null
     and coalesce(a.usuario_id,a.owner_id) = (p_filters->>'sellerId')::uuid)
 )$replacement$);
 definition:=replace(definition,total_anchor,$replacement$'sellerId', nullif(p_filters->>'sellerId',''), 'total', total$replacement$);
 execute definition;
end $migration$;
notify pgrst,'reload schema';
commit;
