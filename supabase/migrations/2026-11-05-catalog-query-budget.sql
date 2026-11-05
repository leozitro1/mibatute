begin;

-- Preserve the installed query, filters, RLS, owner, grants and page sizes.
-- Validate before running full-text search or hashing the seed for each row.
do $migration$
declare definition text; source text; guarded text; language_name text; elevated boolean;
begin
 select pg_get_functiondef(p.oid),p.prosrc,l.lanname,p.prosecdef
 into strict definition,source,language_name,elevated
 from pg_proc p join pg_language l on l.oid=p.prolang
 where p.oid='public.home_article_page(jsonb,integer)'::regprocedure;
 if position('bounded_catalog_filters_v1' in source)>0 then return;end if;
 if language_name<>'sql' or elevated or ltrim(source,E' \t\n\r') not ilike 'with %'
   or position('LANGUAGE sql' in definition)=0 or position(source in definition)=0 then
  raise exception 'La consulta del catálogo cambió; revisar antes de proteger sus filtros.';
 end if;
 guarded:=$guard$
declare field text;
begin
 -- bounded_catalog_filters_v1
 p_filters:=coalesce(p_filters,'{}'::jsonb);
 if jsonb_typeof(p_filters)<>'object' or octet_length(p_filters::text)>4096 then
  raise exception 'Los filtros del catálogo no son válidos o son demasiado grandes.' using errcode='22023';
 end if;
 foreach field in array array['search','featuredSeed','city','locality','category','subcategory'] loop
  if p_filters ? field and jsonb_typeof(p_filters->field) not in ('string','null') then
   raise exception 'Los filtros de texto deben ser cadenas.' using errcode='22023';
  end if;
 end loop;
 if length(coalesce(p_filters->>'search',''))>200
  or length(coalesce(p_filters->>'featuredSeed',''))>80
  or greatest(length(coalesce(p_filters->>'city','')),length(coalesce(p_filters->>'locality','')),
    length(coalesce(p_filters->>'category','')),length(coalesce(p_filters->>'subcategory','')))>100 then
  raise exception 'Acorta la búsqueda o los filtros del catálogo.' using errcode='22023';
 end if;
 return (
$guard$||rtrim(source,E' \t\n\r;')||E'\n );\nend;\n';
 definition:=replace(definition,source,guarded);
 definition:=replace(definition,'LANGUAGE sql','LANGUAGE plpgsql');
 execute definition;
end $migration$;

notify pgrst,'reload schema';
commit;
