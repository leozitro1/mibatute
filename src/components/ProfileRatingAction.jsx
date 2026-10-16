import { CheckCircle2,Star } from 'lucide-react';

export default function ProfileRatingAction({rated,onClick}) {
  return <button type="button" disabled={rated} data-rating-action
    data-rating-pending={!rated?'true':undefined}
    onPointerDown={event=>event.stopPropagation()} onMouseDown={event=>event.stopPropagation()}
    onClick={event=>{event.stopPropagation();onClick?.();}}
    className={`profile-rating-action ${rated?'profile-rating-complete':'profile-rating-pending'}`}
    title={rated?'Transacción calificada':'Calificar transacción'}
    aria-label={rated?'Transacción calificada':'Calificar transacción'}>
    {rated?<CheckCircle2 size={16} aria-hidden="true" />:<Star size={16} aria-hidden="true" />}
    <span>{rated?'Calificado':'Calificar'}</span>
  </button>;
}
