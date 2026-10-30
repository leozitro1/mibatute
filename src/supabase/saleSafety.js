export async function saleSafetyStatus(client, articleId, chatId = null) {
  const { data, error } = await client.rpc('sale_safety_status', { p_article: articleId, p_chat: chatId });
  if (error) throw new Error(error.message);
  if (!data?.reservation || !data?.chat) throw new Error('No se pudo comprobar la reserva.');
  return data;
}
export async function saleSafetyAction(client, state, action, reason = '') {
  if (!state?.reservation || !state?.chat) throw new Error('Actualiza la reserva antes de continuar.');
  if (!['cancel', 'declare_payment', 'payment_problem', 'review_cancellation'].includes(action)) throw new Error('Acción inválida.');
  const detail = String(reason).trim();
  if (action !== 'declare_payment' && (detail.length < 8 || detail.length > 500)) throw new Error('Escribe un motivo de 8 a 500 caracteres.');
  const { data, error } = await client.rpc('sale_safety_action', {
    p_chat: state.chat, p_reservation: state.reservation, p_action: action, p_reason: detail,
  });
  if (error) throw new Error(error.message);
  if (!data?.state?.reservation || data.state.reservation !== state.reservation) throw new Error('No se pudo confirmar la operación. Actualiza la reserva.');
  return data;
}
