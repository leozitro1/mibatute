import { isPublicationExpired, publicationExpiresAt } from './articleLifetime.js';

export const CONVERSATION_NOTIFICATION_TYPES = new Set([
  'chat', 'pickup_proposed', 'pickup_confirmed', 'pickup_rejected', 'pickup_canceled',
  'sale_approved', 'donation_accepted', 'delivery_completed',
]);

export async function fetchActivityNotifications(client, uid) {
  if (!uid) return [];
  const { data, error } = await client.from('activity_notifications')
    .select('id,type,articulo_id,chat_id,buyer_id,receipt_id,created_at,title,subtitle,thumb')
    .eq('recipient_id', uid).order('created_at', { ascending: false }).order('id').limit(10);
  // Older deployments keep their existing notifications until the migration is installed.
  if (error?.code === '42P01' || error?.code === 'PGRST205') return [];
  if (error) throw error;
  return (data || []).map(item => ({ ...item, read: false, unreadCount: 1 }));
}

export function publicationExpiryNotifications(articles, uid, now = Date.now()) {
  if (!uid) return [];
  return (articles || []).filter(article => String(article.owner_id || article.usuario_id) === String(uid)
    && ['disponible', 'available'].includes(article.status || article.estado)
    && isPublicationExpired(article, now)).map(article => ({
    id: `expiry-${article.id}`, type: 'publication_expired', articulo_id: article.id,
    created_at: new Date(publicationExpiresAt(article)).toISOString(),
    title: 'Publicación vencida', subtitle: `${article.title || article.titulo || 'Tu publicación'} · Cumplió sus 60 días.`,
    thumb: article.image_url || article.imagen_url_principal || '', read: false, unreadCount: 1,
  }));
}

export function activityDestination(type) {
  if (CONVERSATION_NOTIFICATION_TYPES.has(type)) return 'chat';
  if (type === 'system_notice') return 'buzon';
  if (['donation_rejected', 'reservation_canceled', 'rating_received'].includes(type)) return 'rescates';
  return 'publicaciones';
}
