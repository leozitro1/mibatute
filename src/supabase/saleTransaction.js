export async function transitionSale(client, articleId, action) {
  if (!articleId || !["reserve", "cancel", "deliver"].includes(action)) {
    throw new Error("Operacion de venta invalida.");
  }
  const { data, error } = await client.rpc("transition_sale", {
    p_articulo_id: articleId,
    p_action: action,
  });
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883") {
      throw new Error("Falta habilitar las reservas de ventas en Supabase. Contacta al administrador.");
    }
    throw new Error(error.message || "No se pudo actualizar la venta.");
  }
  const article = data?.article;
  const chat = data?.chat;
  const expected = { reserve: "reservado", cancel: "disponible", deliver: "entregado" }[action];
  if (String(article?.id) !== String(articleId) || article?.status !== expected || article?.estado !== expected
    || (action === "reserve" && (!article.buyer_id || !chat?.id
      || String(chat.articulo_id) !== String(articleId) || String(chat.buyer_id) !== String(article.buyer_id)
      || chat.status !== "open")) || (action === "cancel" && article.buyer_id)) {
    throw new Error("La base de datos no confirmo la operacion. Actualiza la pagina e intenta de nuevo.");
  }
  return { article, chat };
}
