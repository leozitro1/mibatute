import { CheckCircle2, ClipboardCheck } from 'lucide-react';

export default function ProfileRatingAction({rated,onClick}) {
  const label = rated ? 'Transacción calificada' : 'Calificar transacción';
  return <button type="button" disabled={rated} data-rating-action
    data-rating-pending={!rated ? 'true' : undefined}
    onPointerDown={event=>event.stopPropagation()} onMouseDown={event=>event.stopPropagation()}
    onClick={event=>{event.stopPropagation();onClick?.();}}
    className={`profile-rating-action ${rated ? 'profile-rating-complete' : 'profile-rating-pending'}`}
    title={label}
    aria-label={label}>
    {rated ? <CheckCircle2 size={16} aria-hidden="true" /> : <ClipboardCheck size={16} aria-hidden="true" />}
    <span>{rated?'Calificado':'Calificar'}</span>
  </button>;
}
