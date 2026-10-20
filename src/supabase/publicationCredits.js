export async function publicationStatus(client) {
  const { data, error } = await client.rpc('sale_publication_status');
  if (error) throw new Error(error.code === 'PGRST202' ? 'Falta habilitar los limites de publicaciones en la base de datos.' : error.message);
  return data;
}

export async function commitPublication(client, { article, requestId, useCredit = false }) {
  const { data, error } = await client.rpc('publish_article_with_credit', {
    p_article: article, p_request_id: requestId, p_use_credit: useCredit,
  });
  if (error) return { success: false, error: error.code === 'PGRST202'
    ? 'Falta habilitar los limites de publicaciones en la base de datos.' : error.message };
  if (!data || typeof data.success !== 'boolean') return { success: false, error: 'No se pudo confirmar la publicacion. Reintenta sin cambiar el formulario.' };
  return data;
}
