export const RESCATE_ARTICLE_COLUMNS = `id,title,mode,estado,status,city,locality,price,
  owner_id,usuario_id,buyer_id,ganador_id,winner_id,recipient_id,
  image_url,imagen_url_principal,imagenes,delivered_at,updated_at,created_at,
  articulo_imagenes(id,url,position)`;

export function saleCancellation(row) {
  const article = row?.articulo;
  const canceledAt = Date.parse(row?._canceledAt || '');
  if (!String(article?.mode || article?.tipo || '').toLowerCase().includes('venta')
    || row?._chatStatus !== 'closed' || !Number.isFinite(canceledAt) || !row?._canceledBy) return null;
  const bySeller = String(row._canceledBy) === String(article.owner_id);
  return { bySeller, expiresAt: canceledAt + 24 * 60 * 60 * 1000 };
}

export function isRescateSaleLocked(row) {
  const article = row?.articulo;
  if (!String(article?.mode || article?.tipo || '').toLowerCase().includes('venta')) return false;
  const status = article?.estado || article?.status;
  return status === 'entregado' || (status === 'reservado' && !!(row._chatApprovedAt || row._chatStatus === 'open'));
}

export function donationRejection(row) {
  const rejectedAt = Date.parse(row?._rejectedAt || '');
  if (row?._source !== 'rechazadas' || !Number.isFinite(rejectedAt)) return null;
  return { expiresAt: rejectedAt + 24 * 60 * 60 * 1000 };
}

export function isRescateVisible(row, userId, now = Date.now()) {
  const article = row?.articulo;
  if (!article || !userId) return false;
  const rejection = donationRejection(row);
  if (rejection) return now < rejection.expiresAt;
  const cancellation = saleCancellation(row);
  if (cancellation) return cancellation.bySeller && now < cancellation.expiresAt;
  const status = String(article.estado || article.status || "disponible").toLowerCase().trim();
  const isSale = String(article.mode || article.tipo || "").toLowerCase().includes("venta");
  if (!isSale) {
    const winner = article.ganador_id || article.winner_id || article.recipient_id;
    return !(["reservado", "entregado"].includes(status) && winner)
      || String(winner) === String(userId);
  }
  const buyer = article.buyer_id;
  if (String(buyer || "") === String(userId)) return true;
  const requested = ["postulaciones", "chats"].includes(row._source);
  return requested && (["disponible", "pausado", "en_revision"].includes(status)
    || (status === "reservado" && !buyer));
}

export function canOpenRescateChat(row, userId, hasChat = false) {
  const article = row?.articulo;
  if (!article || !userId) return false;
  if (donationRejection(row)) return false;
  if (saleCancellation(row)) return false;
  const status = String(article.estado || article.status || "disponible").toLowerCase().trim();
  if (status === "en_revision") return false;
  if (String(article.mode || article.tipo || "").toLowerCase().includes("venta")) {
    if (row._chatStatus === "pending") return false;
    return isRescateVisible(row, userId) && (!!row._chatId || hasChat
      || String(article.buyer_id || "") === String(userId));
  }
  const winner = article.ganador_id || article.winner_id || article.recipient_id;
  return String(winner || "") === String(userId) && ["reservado", "entregado"].includes(status);
}

export async function queryMisRescates(client, userId) {
  if (!userId) return { data: [], error: null };

  const posts = await client.rpc("my_rescue_applications");
  const chats = await client.from("chats")
    .select(`id,articulo_id,created_at,status,approved_at,canceled_at,canceled_by,articulo:articulos(${RESCATE_ARTICLE_COLUMNS})`)
    .eq("buyer_id", userId);
  const purchases = await client.from("articulos")
    .select(RESCATE_ARTICLE_COLUMNS).eq("buyer_id", userId);

  // A failed source must not look like an empty rescue history.
  const error = posts.error || chats.error || purchases.error;
  if (error) return { data: [], error };

  const rows = [
    ...(posts.data || []).map(row => ({ ...row, _source: row._source || "postulaciones" })),
    ...(chats.data || []).map(row => ({ ...row, _source: "chats", _chatId: row.id, _chatStatus: row.status,
      _canceledAt: row.canceled_at, _canceledBy: row.canceled_by, _chatApprovedAt: row.approved_at })),
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
    else articles.set(key, { ...previous, articulo: row.articulo,
      _chatId: row._chatId || previous._chatId, _chatStatus: row._chatStatus || previous._chatStatus,
      _canceledAt: Object.hasOwn(row, '_canceledAt') ? row._canceledAt : previous._canceledAt,
      _canceledBy: Object.hasOwn(row, '_canceledBy') ? row._canceledBy : previous._canceledBy,
      _chatApprovedAt: Object.hasOwn(row, '_chatApprovedAt') ? row._chatApprovedAt : previous._chatApprovedAt });
  }
  return {
    data: [...articles.values()].filter(row => isRescateVisible(row, userId))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
    error: null,
  };
}
