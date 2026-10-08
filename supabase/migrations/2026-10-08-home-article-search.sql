begin;

create extension if not exists unaccent;

-- Resolve the extension schema: Supabase may already have it in extensions.
do $$
declare extension_schema text;
begin
  select n.nspname into extension_schema
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'unaccent';
  if not exists (select 1 from pg_ts_dict d join pg_namespace n on n.oid = d.dictnamespace
    where n.nspname = 'public' and d.dictname = 'article_unaccent') then
    execute format(
      'create text search dictionary public.article_unaccent (template = %I.unaccent, rules = ''unaccent'')',
      extension_schema
    );
  end if;

  -- Keep an existing configuration intact when reapplying the migration.
  if not exists (select 1 from pg_ts_config c join pg_namespace n on n.oid = c.cfgnamespace
    where n.nspname = 'public' and c.cfgname = 'article_search') then
    create text search configuration public.article_search (copy = pg_catalog.simple);
    -- simple retains every word, including "de", without stemming.
    alter text search configuration public.article_search
      alter mapping for asciiword, word, hword, asciihword, hword_part, hword_asciipart
      with public.article_unaccent, pg_catalog.simple;
  end if;
end;
$$;

alter table public.articulos add column if not exists home_search_document tsvector
  generated always as (to_tsvector('public.article_search'::regconfig,
    coalesce(title, '') || ' ' || coalesce(titulo, '') || ' ' ||
    coalesce(description, '') || ' ' ||
    coalesce(category, '') || ' ' || coalesce(categoria, '') || ' ' ||
    coalesce(subcategory, '') || ' ' || coalesce(subcategoria, '')
  )) stored;
create index if not exists articulos_home_search_gin on public.articulos using gin (home_search_document);

create or replace function public.home_article_page(p_filters jsonb default '{}', p_page integer default 1)
returns jsonb language sql stable security invoker set search_path = public as $$
  with search as (
    select trim(regexp_replace(coalesce(p_filters->>'search', ''), '\s+', ' ', 'g')) as text
  ), prefix_search as (
    select s.text,
      -- Serialize parsed lexemes with PostgreSQL's escaping; raw input never becomes tsquery syntax.
      coalesce((select string_agg(array_to_tsvector(array[lexeme])::text || ':*', ' & ' order by lexeme)::tsquery
        from unnest(tsvector_to_array(to_tsvector('public.article_search'::regconfig, s.text))) as words(lexeme)),
        ''::tsquery) as query
    from search s
  ), normalized as (
    select a.id, a.created_at, a.is_featured,
      coalesce(a.usuario_id, a.owner_id) = auth.uid() as own,
      case lower(trim(coalesce(nullif(a.estado, ''), a.status, 'disponible')))
        when 'available' then 'disponible' when 'reserved' then 'reservado'
        when 'delivered' then 'entregado'
        else lower(trim(coalesce(nullif(a.estado, ''), a.status, 'disponible'))) end as state,
      case when lower(a.mode) like '%don%' or lower(a.mode) like '%regal%' then 'donacion'
        when lower(a.mode) like '%venta%' then 'venta' else lower(trim(a.mode)) end as kind,
      lower(trim(coalesce(a.category, a.categoria, ''))) as category,
      lower(trim(coalesce(a.subcategory, a.subcategoria, ''))) as subcategory
    from public.articulos a cross join prefix_search s
    where a.created_at > now() - interval '1440 hours'
      and a.city = coalesce(p_filters->>'city', 'Bogotá')
      and (coalesce(p_filters->>'locality', 'Todas') = 'Todas' or a.locality = p_filters->>'locality')
      and (s.text = '' or a.home_search_document @@ s.query)
  ), filtered as materialized (
    select * from normalized
    where not (coalesce((p_filters->>'hideOwn')::boolean, false) and coalesce(own, false))
      and state not in ('pausado', 'entregado')
      and (not coalesce((p_filters->>'onlyActive')::boolean, true) or state <> 'reservado')
      and (coalesce(p_filters->>'kind', 'todo') = 'todo'
        or (p_filters->>'kind' = 'destacado' and is_featured)
        or kind = p_filters->>'kind')
      and (coalesce(p_filters->>'category', 'Todo') = 'Todo' or category = lower(trim(p_filters->>'category')))
      and (coalesce(p_filters->>'subcategory', '') = '' or subcategory = lower(trim(p_filters->>'subcategory')))
  ), totals as (
    select count(*) as total,
      least(greatest(coalesce(p_page, 1), 1), greatest(1, ceil(count(*) / 9.0)::integer)) as page
    from filtered
  ), page_ids as (
    select id from filtered
    order by
      case when p_filters->>'sort' = 'oldest' then created_at end asc,
      case when coalesce(p_filters->>'sort', 'newest') <> 'oldest' then created_at end desc,
      id
    limit 9 offset (select (page - 1) * 9 from totals)
  ), featured_ids as (
    select id from filtered where is_featured
    order by md5(id::text || coalesce(p_filters->>'featuredSeed', '')) limit 12
  )
  select jsonb_build_object('total', total, 'page', page,
    'ids', coalesce((select jsonb_agg(id) from page_ids), '[]'::jsonb),
    'featuredIds', coalesce((select jsonb_agg(id) from featured_ids), '[]'::jsonb)) from totals;
$$;
revoke all on function public.home_article_page(jsonb, integer) from public;
grant execute on function public.home_article_page(jsonb, integer) to anon, authenticated;

notify pgrst, 'reload schema';
commit;
