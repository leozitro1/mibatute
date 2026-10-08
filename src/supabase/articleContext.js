export function isSaleArticle(article) {
  const type = [article?.mode, article?.tipo, article?.tipo_publicacion, article?.tipo_publicación]
    .map(value => String(value || "").trim().toLowerCase()).find(Boolean) || "";
  return type.includes("venta");
}

export async function readArticleContext(client, articleId) {
  const { data, error } = await client.rpc("article_context", { p_article_id: articleId });
  if (error) throw new Error(error.code === "PGRST202" || error.code === "42883"
    ? "Falta habilitar la consulta de reservas en Supabase. Contacta al administrador."
    : error.message || "No se pudo consultar la reserva.");
  const article = data?.[0];
  if (!article || String(article.id) !== String(articleId)) {
    throw new Error("El articulo no existe o no tienes permiso para consultarlo.");
  }
  return article;
}

export function resolveChatBuyerId({ article, chat, userId, otherUserId }) {
  return chat?.buyer_id || article?.buyer_id || article?.buyerId
    || article?.ganador_id || article?.winner_id || article?.recipient_id
    || (String(userId) === String(article?.owner_id || article?.usuario_id) ? otherUserId : userId)
    || null;
}

export async function readNotificationChatContext(client, { chatId, articleId, userId }) {
  const { data, error } = await client.rpc('notification_chat_context', { p_chat_id: chatId });
  if (error) throw new Error(error.code === 'PGRST202' || error.code === '42883'
    ? 'Falta habilitar los enlaces de notificaciones en Supabase. Contacta al administrador.'
    : error.message || 'No se pudo consultar la conversación. Intenta nuevamente.');
  const article = data?.[0];
  const chat = article?.transaction_chat;
  if (!chat?.id || String(chat.id) !== String(chatId) || String(article.id) !== String(articleId)
    || String(chat.articulo_id) !== String(articleId)
    || ![chat.buyer_id, chat.seller_id].filter(Boolean).some(id => String(id) === String(userId))) {
    const failure = new Error('Esta conversación ya no está disponible. El aviso se conserva en tu historial.');
    failure.code = 'NOTIFICATION_CHAT_UNAVAILABLE';
    throw failure;
  }
  return article;
}

export function validateTransactionChat(article, userId) {
  const chat = article?.transaction_chat;
  const buyerId = article?.buyer_id || article?.ganador_id || article?.winner_id || article?.recipient_id;
  if (!chat?.id || !buyerId || String(chat.articulo_id) !== String(article.id)
    || String(chat.buyer_id) !== String(buyerId)
    || ![chat.buyer_id, chat.seller_id, chat.owner_id, chat.usuario_id].filter(Boolean).some(id => String(id) === String(userId))) {
    return null;
  }
  return chat;
}
