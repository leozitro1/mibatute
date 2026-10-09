begin;

create or replace function public.home_article_page(p_filters jsonb default '{}', p_page integer default 1)
returns jsonb language sql stable security invoker set search_path = public as $$
  with search as (
    select trim(regexp_replace(coalesce(p_filters->>'search', ''), '\s+', ' ', 'g')) as text,
      least(10, greatest(0, coalesce((p_filters->>'minCondition')::integer, 0))) as min_condition
  ), prefix_search as (
    select s.text, s.min_condition,
      -- Serialize parsed lexemes with PostgreSQL's escaping; raw input never becomes tsquery syntax.
      coalesce((select string_agg(array_to_tsvector(array[lexeme])::text || ':*', ' & ' order by lexeme)::tsquery
        from unnest(tsvector_to_array(to_tsvector('public.article_search'::regconfig, s.text))) as words(lexeme)),
        ''::tsquery) as query
    from search s
  ), effective_search as (
    select s.text, s.min_condition, s.query as direct_query,
      case when p_filters->>'searchMode' = 'related'
        then public.article_related_prefix_query(s.text) else s.query end as query
    from prefix_search s
  ), normalized as (
    select a.id, a.created_at, a.is_featured,
      a.home_search_document @@ s.direct_query as direct_match,
      coalesce(a.usuario_id, a.owner_id) = auth.uid() as own,
      case lower(trim(coalesce(nullif(a.estado, ''), a.status, 'disponible')))
        when 'available' then 'disponible' when 'reserved' then 'reservado'
        when 'delivered' then 'entregado'
        else lower(trim(coalesce(nullif(a.estado, ''), a.status, 'disponible'))) end as state,
      case when lower(a.mode) like '%don%' or lower(a.mode) like '%regal%' then 'donacion'
        when lower(a.mode) like '%venta%' then 'venta' else lower(trim(a.mode)) end as kind,
      lower(trim(coalesce(a.category, a.categoria, ''))) as category,
      lower(trim(coalesce(a.subcategory, a.subcategoria, ''))) as subcategory
    from public.articulos a cross join effective_search s
    where a.created_at > now() - interval '1440 hours'
      and (s.min_condition = 0 or a.estado_producto >= s.min_condition)
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
      direct_match desc,
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
