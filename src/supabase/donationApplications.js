export async function applyForDonation(client, { articleId, message, useCredit = false }) {
  const { data, error } = await client.rpc('apply_for_donation', {
    p_article_id: articleId, p_message: message, p_use_credit: useCredit,
  });
  if (error) return { success: false, error: error.code === 'PGRST202'
    ? 'Falta habilitar el nuevo sistema de donaciones en Supabase.' : error.message };
  if (!data || typeof data.success !== 'boolean') return { success: false, error: 'No se pudo confirmar la solicitud.' };
  if (!data.success) {
    const minutes = Math.max(1, Math.ceil((Date.parse(data.nextFreeAt) - Date.now()) / 60000));
    return { ...data, meta: { h: Math.floor(minutes / 60), m: minutes % 60 } };
  }
  return { ...data, data };
}

export async function donationStatus(client) {
  const { data, error } = await client.rpc('donation_application_status');
  if (error) throw error;
  return data;
}

export async function accountCreditStatus(client) {
  const { data, error } = await client.rpc('account_credit_status');
  if (error) throw error;
  return data;
}
