begin;
-- Personal catalog queries use an OR across current and historical participant
-- columns. Every branch needs an index to avoid a full-table scan as data grows.
-- owner_id, full-text search and chat cursors already have indexes; do not duplicate them.
create index if not exists articulos_usuario_recent_idx on public.articulos(usuario_id,created_at desc,id) where usuario_id is not null;
create index if not exists articulos_buyer_recent_idx on public.articulos(buyer_id,created_at desc,id) where buyer_id is not null;
create index if not exists articulos_ganador_recent_idx on public.articulos(ganador_id,created_at desc,id) where ganador_id is not null;
create index if not exists articulos_winner_recent_idx on public.articulos(winner_id,created_at desc,id) where winner_id is not null;
create index if not exists articulos_recipient_recent_idx on public.articulos(recipient_id,created_at desc,id) where recipient_id is not null;
commit;
