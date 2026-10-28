import { Sprout } from 'lucide-react';
import './ReuseImpact.css';

export default function ReuseImpact({ impact }) {
  const count = Number(impact?.articles);
  if (!impact || !Number.isSafeInteger(count) || count < 0) return null;
  const started = new Date(impact.since);
  const since = Number.isFinite(started.getTime()) ? new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Bogota' }).format(started) : null;
  return <section className="reuse-impact" aria-label="Artículos con una segunda oportunidad">
    <Sprout size={22} aria-hidden="true" />
    <div><p><strong>{count.toLocaleString('es-CO')}</strong> {count === 1 ? 'artículo encontró' : 'artículos encontraron'} una segunda oportunidad</p>
      <small>Según ventas y donaciones marcadas como entregadas {since ? `desde el ${since}` : 'desde el inicio del contador'}. Cada publicación cuenta una vez.</small>
    </div>
  </section>;
}
