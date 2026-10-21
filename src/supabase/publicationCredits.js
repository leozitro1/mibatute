export async function publicationStatus(client) {
  const { data, error } = await client.rpc('sale_publication_status');
  if (error) throw new Error(error.code === 'PGRST202' ? 'Falta habilitar los limites de publicaciones en la base de datos.' : error.message);
  return data;
}

export async function commitPublication(client, { article, requestId, useCredit = false, feature = false }) {
  const { data, error } = await client.rpc('publish_article_with_credit', {
    p_article: article, p_request_id: requestId, p_use_credit: useCredit,
    ...(feature?{p_feature:true}:{}),
  });
  if (error) return { success: false, error: error.code === 'PGRST202'
    ? 'Falta habilitar los limites de publicaciones en la base de datos.' : error.message };
  if (!data || typeof data.success !== 'boolean') return { success: false, error: 'No se pudo confirmar la publicacion. Reintenta sin cambiar el formulario.' };
  return data;
}

export function publicationQuote(status,mode,feature=false) {
  const publicationCost=mode==='venta'&&status?.requiresCredit?1:0;
  const featureCost=feature?1:0;
  const balance=Number.isInteger(status?.balance)?Math.max(0,status.balance):0;
  return {publicationCost,featureCost,total:publicationCost+featureCost,balance,
    canAddFeature:!!status&&balance>=publicationCost+1,
    sufficient:!!status&&balance>=publicationCost+featureCost};
}
