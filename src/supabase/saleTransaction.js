export async function transitionSale(client, articleId, action, useCredit = false) {
  if (!articleId || !["reserve", "cancel", "deliver", "approve_chat"].includes(action)) {
    throw new Error("Operacion de venta invalida.");
  }
  const { data, error } = await client.rpc(useCredit ? 'transition_sale_with_credit' : 'transition_sale', {
    p_articulo_id: articleId,
    p_action: action,
    ...(useCredit ? { p_use_credit: true } : {}),
  });
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883") {
      throw new Error("Falta habilitar las reservas de ventas en Supabase. Contacta al administrador.");
    }
    throw new Error(error.message || "No se pudo actualizar la venta.");
  }
  if (data?.success === false) {
    throw Object.assign(new Error(data.error || 'No se pudo reservar la compra.'), { code: data.code, quote: data });
  }
  const article = data?.article;
  const chat = data?.chat;
  const expected = { reserve: "reservado", approve_chat: "reservado", cancel: "disponible", deliver: "entregado" }[action];
  if (String(article?.id) !== String(articleId) || article?.status !== expected || article?.estado !== expected
    || (["reserve", "approve_chat"].includes(action) && (!article.buyer_id || !chat?.id
      || String(chat.articulo_id) !== String(articleId) || String(chat.buyer_id) !== String(article.buyer_id)
      || !(action === "approve_chat" ? ["open"] : ["pending", "open"]).includes(chat.status))) || (action === "cancel" && article.buyer_id)) {
    throw new Error("La base de datos no confirmo la operacion. Actualiza la pagina e intenta de nuevo.");
  }
  return { article, chat, ...(Number.isInteger(data.balance) ? { balance: data.balance, cost: data.cost } : {}) };
}
