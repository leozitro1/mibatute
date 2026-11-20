begin;
-- Preserve the current catalog, RLS and query budgets; remove only term expansion.
do $migration$
declare definition text;pattern text:=$pattern$case when p_filters->>'searchMode' = 'related'
        then public.article_related_prefix_query(s.text) else s.query end$pattern$;
begin
 select pg_get_functiondef('public.home_article_page(jsonb,integer)'::regprocedure) into definition;
 if strpos(definition,pattern)>0 then
  execute replace(definition,pattern,'s.query');
 elsif strpos(definition,'article_related_prefix_query')>0 then
  raise exception 'La búsqueda del catálogo cambió. Revisa su definición antes de retirar la expansión.';
 end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname<>'article_related_prefix_query' and strpos(p.prosrc,'article_related_prefix_query')>0) then
  raise exception 'Otra función todavía usa la búsqueda relacionada. Revisa la dependencia antes de retirarla.';
 end if;
end $migration$;
drop function if exists public.article_related_prefix_query(text);
notify pgrst,'reload schema';
commit;
