import { databaseActionError } from './databaseActionError.js';

export async function publicationDeletionStatus(client, articleId) {
  const { data, error } = await client.rpc('publication_deletion_status', { p_article_id: articleId });
  if (error) throw databaseActionError(error, 'No se pudo comprobar cuándo recuperas el cupo. Intenta de nuevo.');
  if (!data || typeof data.holdsSlot !== 'boolean') throw new Error('No se pudo comprobar el cupo de esta publicación.');
  return data;
}

export function publicationDeletionMessage(status) {
  let message = '¿Eliminar esta publicación? Esta acción no se puede deshacer.';
  if (status.holdsSlot) {
    const date = new Date(status.releaseAt);
    if (!Number.isFinite(date.getTime())) throw new Error('No se pudo comprobar la fecha de liberación del cupo.');
    message += `\n\nYa pasaron las primeras 12 horas. El aviso dejará de verse, pero el cupo seguirá ocupado durante 10 días desde el borrado, hasta aproximadamente el ${date.toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'medium', timeStyle: 'short' })}.`;
  } else if (status.active) {
    message += '\n\nSi el borrado se completa dentro de las primeras 12 horas, recuperas el cupo inmediatamente. Después de ese plazo, se retiene durante 10 días.';
  } else {
    message += '\n\nEsta publicación ya no ocupa un cupo activo.';
  }
  return message;
}
