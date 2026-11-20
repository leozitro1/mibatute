import { databaseActionError } from './databaseActionError.js';

export const ARTICLE_EDIT_LOCK_MESSAGE = 'Esta publicación ya tiene ofertas o solicitudes de donación y no se puede editar.';

export function articleEditingLocked(article, requests) {
  const count = requests ?? (Number(article?.interested_count || 0) > 0);
  return !!(count || article?.buyer_id || article?.buyerId || article?.ganador_id
    || article?.winner_id || article?.recipient_id
    || ['pending', 'open'].includes(article?.transaction_chat?.status));
}

export async function assertArticleEditable(client, articleId) {
  const { error } = await client.rpc('assert_article_editable', { p_article_id: articleId });
  if (error) throw databaseActionError(error, 'No se pudo comprobar si la publicación se puede editar. Intenta de nuevo.');
}

export async function togglePublicationPause(client, article, ownerId, confirm = message => window.confirm(message)) {
  const status = article.estado || article.status || 'disponible';
  if (!['disponible', 'pausado'].includes(status)) return null;
  const pause = status !== 'pausado';
  if (pause && !confirm('¿Pausar esta publicación? Dejará de recibir nuevas solicitudes mientras esté pausada. El cupo seguirá ocupado.')) return null;
  const next = pause ? 'pausado' : 'disponible';
  const { data, error } = await client.from('articulos').update({ estado: next, status: next })
    .eq('id', article.id).eq('owner_id', ownerId).eq('status', status).select('id').single();
  if (error || !data) throw databaseActionError(error, `No se pudo ${pause ? 'pausar' : 'reactivar'} la publicación. Actualiza e intenta de nuevo.`);
  return { ...article, estado: next, status: next, pausado: pause };
}
