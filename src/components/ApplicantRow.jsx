import ProfileAvatar from './ProfileAvatar.jsx';
import { useId, useState } from 'react';
import { Ban, Check, ChevronDown, ChevronUp } from 'lucide-react';
import './ApplicantRow.css';

export default function ApplicantRow({ applicant, user, busy, onChoose, onReject }) {
  const [expanded, setExpanded] = useState(false);
  const messageId = useId();
  const name = applicant.usuarios?.nombre || 'Usuario';
  const message = applicant.justificacion || 'Sin justificación.';
  const date = new Date(applicant.created_at);
  const validDate = !Number.isNaN(date.getTime());
  return (
    <li className={`applicant-row${expanded ? ' is-expanded' : ''}`} data-applicant-row>
      <div className="applicant-row-avatar">
        <ProfileAvatar user={user} photo={applicant.usuarios?.foto_url} name={name} />
      </div>
      <div className="applicant-row-copy">
        <div className="applicant-row-heading">
          <h3 title={name}>{name}</h3>
          {validDate && <time dateTime={date.toISOString()} title={date.toLocaleString('es-CO')}>{date.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}</time>}
        </div>
      </div>
      <div className="applicant-row-preview">
        <p id={messageId}>{message}</p>
      </div>
      <div className="applicant-row-footer">
        <button type="button" className="applicant-row-expand" aria-expanded={expanded} aria-controls={messageId} onClick={() => setExpanded(value => !value)}>
          {expanded ? 'Ver menos' : 'Ver más'}{expanded ? <ChevronUp size={12} aria-hidden="true" /> : <ChevronDown size={12} aria-hidden="true" />}
        </button>
        <div className="applicant-row-actions">
          <button type="button" disabled={busy} onClick={() => onReject(applicant.id)} aria-label={`Rechazar a ${name}`} title="Rechazar solicitud" className="applicant-row-action applicant-row-reject"><Ban size={16} aria-hidden="true" /></button>
          <button type="button" disabled={busy} onClick={() => onChoose(applicant)} aria-label={`Elegir a ${name}`} className="applicant-row-action applicant-row-choose"><Check size={15} aria-hidden="true" />Elegir</button>
        </div>
      </div>
    </li>
  );
}
