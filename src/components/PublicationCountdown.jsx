import { Clock } from 'lucide-react';
import { publicationDaysRemaining, publicationExpiresAt } from './articleLifetime.js';

export default function PublicationCountdown({ article, now = Date.now() }) {
  if (['entregado', 'delivered'].includes(article?.estado || article?.status)) return null;
  const days = publicationDaysRemaining(article, now);
  if (days === null) return null;
  const reserved = ['reservado', 'reserved'].includes(article?.estado || article?.status);
  const label = days === 0 ? (reserved ? 'Plazo cumplido' : 'Vencida')
    : `${days} ${days === 1 ? 'día restante' : 'días restantes'}`;
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 text-[10px] font-medium ${days <= 7 ? 'text-amber-700' : 'text-gray-500'}`}
      title={`Vence: ${new Date(publicationExpiresAt(article)).toLocaleString('es-CO')}`}>
      <Clock size={12} aria-hidden="true" />
      {label}
    </span>
  );
}
