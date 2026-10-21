import { useEffect, useId, useRef, useState } from 'react';
import { Bell, RefreshCw } from 'lucide-react';
import { ATTENTION_SECTIONS, attentionBadge } from './attention.js';

export function AttentionBadge({ count }) {
  return count > 0 ? <span className="staff-attention-badge" aria-label={`${count} ${count === 1 ? 'pendiente' : 'pendientes'}`}>{attentionBadge(count)}</span> : null;
}
export function AttentionDot({ label = 'Necesita atención' }) {
  return <span className="staff-attention-dot" role="img" aria-label={label} title={label} />;
}
export default function StaffAttention({ counts, status, onNavigate, onRefresh }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null), button = useRef(null), panelId = useId();
  useEffect(() => {
    if (!open) return;
    const outside = event => { if (!root.current?.contains(event.target)) setOpen(false); };
    const escape = event => { if (event.key === 'Escape') { setOpen(false); button.current?.focus(); } };
    document.addEventListener('mousedown', outside); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('mousedown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);
  return <div className="staff-attention" ref={root}>
    <button ref={button} type="button" className="staff-icon-button staff-attention-toggle" aria-label={`Notificaciones del equipo${counts ? `: ${counts.pending} pendientes` : ', cargando'}`} aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(value => !value)}>
      <Bell size={20} aria-hidden="true" /><AttentionBadge count={counts?.pending} />
    </button>
    {open && <section id={panelId} className="staff-attention-panel" aria-label="Notificaciones del equipo">
      <header><strong>Necesita atención</strong><button type="button" className="staff-icon-button" onClick={onRefresh} aria-label="Actualizar avisos"><RefreshCw size={16} /></button></header>
      {status === 'error' && <p role="status">Los avisos pueden estar desactualizados. Intenta actualizar.</p>}
      {!counts ? <p role="status">Cargando avisos…</p> : counts.pending === 0 ? <p>No tienes avisos pendientes.</p> : <ul>{ATTENTION_SECTIONS.filter(item => counts[item.id] > 0).map(item => <li key={item.id}><button type="button" onClick={() => { onNavigate(item.id); setOpen(false); }}><span>{item.label}</span><AttentionBadge count={counts[item.id]} /></button></li>)}</ul>}
      <footer>Los reportes y solicitudes siguen pendientes hasta resolverlos. Los mensajes dejan de marcarse al leerlos.</footer>
    </section>}
  </div>;
}
