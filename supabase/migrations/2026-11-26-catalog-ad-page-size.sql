begin;
-- Reserve one desktop slot before counting and paginating; never drop a loaded article.
do $migration$
declare definition text;
  count_anchor text:=$anchor$case when p_filters->>'desktopPageSize' = '12' then 12.0 else 9.0 end$anchor$;
  page_anchor text:=$anchor$case when p_filters->>'desktopPageSize' = '12' then 12 else 9 end$anchor$;
begin
  select pg_get_functiondef('public.home_article_page(jsonb,integer)'::regprocedure) into definition;
  if strpos(definition,$marker$p_filters->>'desktopPageSize' = '11'$marker$)>0 then return; end if;
  if strpos(definition,count_anchor)=0 or strpos(definition,page_anchor)=0 then
    raise exception 'Cambió la paginación del catálogo; revisar antes de reservar el espacio publicitario.';
  end if;
  definition:=replace(definition,count_anchor,
    $replacement$case when p_filters->>'desktopPageSize' = '11' then 11.0 when p_filters->>'desktopPageSize' = '12' then 12.0 else 9.0 end$replacement$);
  definition:=replace(definition,page_anchor,
    $replacement$case when p_filters->>'desktopPageSize' = '11' then 11 when p_filters->>'desktopPageSize' = '12' then 12 else 9 end$replacement$);
  execute definition;
end;
$migration$;
notify pgrst,'reload schema';
commit;
