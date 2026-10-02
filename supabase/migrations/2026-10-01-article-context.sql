-- One read replaces separate article, participant and chat lookups.
create or replace function public.article_context(p_article_id uuid default null)
returns setof jsonb language sql stable security invoker set search_path = public as $$
  select to_jsonb(a) || jsonb_build_object(
    'articulo_imagenes', coalesce((select jsonb_agg(to_jsonb(i) order by i.position, i.id)
      from public.articulo_imagenes i where i.articulo_id = a.id), '[]'::jsonb),
    'owner_public', (select jsonb_build_object('id', u.id, 'nombre', u.nombre, 'foto_url', u.foto_url)
      from public.usuarios_publicos u where u.id = a.owner_id),
    'buyer_public', case when auth.uid() in (a.owner_id, a.buyer_id, a.ganador_id, a.winner_id, a.recipient_id)
      then (select jsonb_build_object('id', u.id, 'nombre', u.nombre, 'foto_url', u.foto_url)
        from public.usuarios_publicos u where u.id = a.buyer_id) else null end,
    'transaction_chat', (select to_jsonb(c) from public.chats c
      where c.articulo_id = a.id
        and c.buyer_id = coalesce(a.buyer_id, a.ganador_id, a.winner_id, a.recipient_id)
        and auth.uid() in (c.buyer_id, c.seller_id, c.owner_id, c.usuario_id)
      limit 1)
  )
  from public.articulos a
  where auth.uid() is not null
    and ((p_article_id is not null and a.id = p_article_id)
      or (p_article_id is null and a.owner_id = auth.uid()))
  order by a.created_at desc, a.id
  limit 100;
$$;
revoke all on function public.article_context(uuid) from public;
grant execute on function public.article_context(uuid) to authenticated;
