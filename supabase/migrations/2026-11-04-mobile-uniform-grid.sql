begin;
-- Two cards per mobile row, including featured articles. Preserve ordering,
-- verification/search filters, RLS, and older clients' pagination.
do $$
declare definition text; anchor text:=$anchor$), counts as ($anchor$;
begin
 select pg_get_functiondef('public.home_article_page(jsonb,integer)'::regprocedure) into definition;
 if position('mobileUniformGrid' in definition)>0 then return;end if;
 if position(anchor in definition)=0 or
  (length(definition)-length(replace(definition,'from ordered','')))/length('from ordered')<>2 then
  raise exception 'La paginación del catálogo cambió; revisar antes de aplicar la cuadrícula.';
 end if;
 definition:=replace(definition,'from ordered','from layout_ordered');
 definition:=replace(definition,anchor,$layout$), layout_ordered as (
    select id,position,case when coalesce((p_filters->>'mobileUniformGrid')::boolean,false)
      then (position+1)/2 else block_position end as block_position from ordered
  ), counts as ($layout$);
 execute definition;
end $$;
notify pgrst,'reload schema';
commit;
