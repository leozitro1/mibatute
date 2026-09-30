export const RESCATE_ARTICLE_COLUMNS = `id,title,mode,estado,status,city,locality,price,
  owner_id,usuario_id,buyer_id,ganador_id,winner_id,recipient_id,
  image_url,imagen_url_principal,imagenes,updated_at,created_at,
  articulo_imagenes(id,url,position)`;

export async function queryMisRescates(client, userId) {
  if (!userId) return { data: [], error: null };

  const posts = await client.from("postulaciones")
    .select(`id,articulo_id,created_at,justificacion,articulo:articulos(${RESCATE_ARTICLE_COLUMNS})`)
    .eq("usuario_id", userId);
  const chats = await client.from("chats")
    .select(`id,articulo_id,created_at,articulo:articulos(${RESCATE_ARTICLE_COLUMNS})`)
    .eq("buyer_id", userId);
  const purchases = await client.from("articulos")
    .select(RESCATE_ARTICLE_COLUMNS).eq("buyer_id", userId);

  // A failed source must not look like an empty rescue history.
  const error = posts.error || chats.error || purchases.error;
  if (error) return { data: [], error };

  const rows = [
    ...(posts.data || []).map(row => ({ ...row, _source: "postulaciones" })),
    ...(chats.data || []).map(row => ({ ...row, _source: "chats" })),
    ...(purchases.data || []).map(article => ({
      id: article.id,
      articulo_id: article.id,
      created_at: article.created_at,
      articulo: article,
      _source: "compras",
    })),
  ];
  const articles = new Map();
  for (const row of rows) {
    if (!row.articulo_id || !row.articulo) continue;
    const key = String(row.articulo_id);
    const previous = articles.get(key);
    if (!previous) articles.set(key, row);
    else articles.set(key, { ...previous, articulo: row.articulo });
  }
  return {
    data: [...articles.values()].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
    error: null,
  };
}
