import { useId, useState } from 'react';
import { Check, ChevronDown, ChevronUp, X } from 'lucide-react';

export default function ApplicantRow({ applicant, busy, onChoose, onReject }) {
  const [expanded, setExpanded] = useState(false);
  const messageId = useId();
  const name = applicant.usuarios?.nombre || 'Usuario';
  const message = applicant.justificacion || 'Sin justificación.';
  const date = new Date(applicant.created_at);
  const validDate = !Number.isNaN(date.getTime());
  return (
    <li className="px-4 py-4 sm:px-6" data-applicant-row>
      <div className="flex items-start gap-3">
        <div className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-green-50 text-sm font-bold text-forest-green">
          <span aria-hidden="true">{name.charAt(0).toUpperCase()}</span>
          {applicant.usuarios?.foto_url && <img src={applicant.usuarios.foto_url} alt="" className="absolute inset-0 h-full w-full object-cover" onError={e => { e.currentTarget.style.display = 'none'; }} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h3 className="min-w-0 break-words text-sm font-semibold text-gray-900">{name}</h3>
            {validDate && <time dateTime={date.toISOString()} title={date.toLocaleString('es-CO')} className="shrink-0 text-xs text-gray-500">{date.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}</time>}
          </div>
          <p id={messageId} className={`mt-1.5 whitespace-pre-wrap break-words text-sm leading-5 text-gray-600 [overflow-wrap:anywhere] ${expanded ? '' : 'line-clamp-2'}`}>{message}</p>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <button type="button" aria-expanded={expanded} aria-controls={messageId} onClick={() => setExpanded(value => !value)} className="inline-flex min-h-9 items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-900 focus-visible:outline-2 focus-visible:outline-forest-green">
              {expanded ? 'Ver menos' : 'Ver más'}{expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            <div className="flex shrink-0 items-center gap-2">
              <button type="button" disabled={busy} onClick={() => onReject(applicant.id)} aria-label={`Rechazar a ${name}`} title="Rechazar solicitud" className="inline-flex h-9 min-w-9 items-center justify-center gap-1.5 rounded-md px-2.5 text-xs font-semibold text-gray-500 hover:bg-red-50 hover:text-red-700 disabled:opacity-40"><X size={15} /><span className="hidden sm:inline">Rechazar</span></button>
              <button type="button" disabled={busy} onClick={() => onChoose(applicant)} aria-label={`Elegir a ${name}`} className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-forest-green px-3 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-40"><Check size={15} />Elegir</button>
            </div>
          </div>
        </div>
      </div>
    </li>
  );
}
