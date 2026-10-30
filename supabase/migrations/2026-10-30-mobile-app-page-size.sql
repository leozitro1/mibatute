-- Opt-in ten mobile rows. Legacy mobile and desktop clients retain their page sizes.
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
  ), ranked as (
    select id, is_featured, row_number() over (
      order by
        direct_match desc,
        case when coalesce(p_filters->>'sort', 'random') = 'random'
          then md5(id::text || coalesce(p_filters->>'featuredSeed', '')) end,
        case when p_filters->>'sort' = 'oldest' then created_at end asc,
        case when p_filters->>'sort' = 'newest' then created_at end desc,
        id
    ) as base_position
    from filtered
  ), grouped as (
    select id, coalesce(is_featured, false) as is_featured,
      row_number() over (partition by coalesce(is_featured, false) order by base_position) as group_position
    from ranked
  ), ordered as (
    -- Interleave globally before paginating: one featured, then six normal articles.
    select id, row_number() over (
      order by case when is_featured then (group_position - 1) * 7
        else group_position + (group_position - 1) / 6 end, id
    ) as position,
      -- A mobile block is a full-width feature or a pair of normal articles.
      dense_rank() over (
        order by case when is_featured then (group_position - 1) * 4
          else (group_position + 1) / 2 + (group_position - 1) / 6 end
      ) as block_position
    from grouped
  ), counts as (
    select count(*) as total,
      greatest(1, case when p_filters->>'layout' = 'mobile'
        then ceil(coalesce(max(block_position), 0) / (case when p_filters->>'mobilePageRows' = '10' then 10.0 else 4.0 end))::integer
        else ceil(count(*) / (case when p_filters->>'desktopPageSize' = '12' then 12.0 else 9.0 end))::integer end) as page_count
    from ordered
  ), totals as (
    select total, page_count,
      least(greatest(coalesce(p_page, 1), 1), page_count) as page from counts
  ), page_ids as (
    select id, position from ordered
    where case when p_filters->>'layout' = 'mobile' then (block_position - 1) / (case when p_filters->>'mobilePageRows' = '10' then 10 else 4 end) + 1
      else (position - 1) / (case when p_filters->>'desktopPageSize' = '12' then 12 else 9 end) + 1 end = (select page from totals)
    order by position
  ), featured_ids as (
    select id from filtered where is_featured
    order by md5(id::text || coalesce(p_filters->>'featuredSeed', '')) limit 12
  )
  select jsonb_build_object('reuseImpact', public.market_reuse_impact(), 'total', total, 'page', page, 'pageCount', page_count,
    'ids', coalesce((select jsonb_agg(id order by position) from page_ids), '[]'::jsonb),
    'featuredIds', coalesce((select jsonb_agg(id) from featured_ids), '[]'::jsonb)) from totals;
$$;
revoke all on function public.home_article_page(jsonb, integer) from public;
grant execute on function public.home_article_page(jsonb, integer) to anon, authenticated;

commit;
