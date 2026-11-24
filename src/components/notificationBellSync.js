import { mergeNotificationHistory, notificationGroupKey, NOTIFICATION_STATE_LIMIT } from './notificationHistory.js';

export async function acknowledgeNotificationBell(client, items, action = 'read') {
  const snapshot = mergeNotificationHistory([], items, NOTIFICATION_STATE_LIMIT);
  if (!snapshot.length) return;
  const {error} = await client.rpc('notification_bell_ack', {
    p_items: snapshot.map(item => ({key: notificationGroupKey(item), created_at: item.created_at})),
    p_action: action,
  });
  if (error) throw new Error('No pudimos sincronizar los avisos vistos. Vuelve a intentarlo.');
}
