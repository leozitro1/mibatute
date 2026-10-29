import { useEffect, useRef } from 'react';
import { Bell, X, CheckCircle2, Trash2 } from 'lucide-react';
import ContactText from './ContactText.jsx';
import { publicContactText } from './contactText.js';
import { messageSections } from './messagePresentation.js';
import './SystemMessageDialog.css';

export default function SystemMessageDialog({ message, onClose, onToggleRead, onDelete }) {
  const dialog = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.focus();
    return () => previous?.focus?.();
  }, []);
  const created = new Date(message.created_at);
  const date = Number.isFinite(created.getTime()) ? created.toLocaleString('es-CO', { dateStyle: 'long', timeStyle: 'short' }) : '';
  const severity = { critical: 'Importante', warning: 'Aviso', info: 'Información' }[message.severity] || 'Información';
  function handleKeys(event) {
    if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
    if (event.key !== 'Tab') return;
    const controls = [...dialog.current.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), [tabindex="0"]')];
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) { event.preventDefault(); first?.focus(); }
  }
  return <div className="marketplace-overlay system-message-overlay" onClick={onClose}>
    <section ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="system-message-title"
      data-system-message-receipt={message.receipt_id} className="system-message-dialog" onKeyDown={handleKeys} onClick={event => event.stopPropagation()}>
      <header className="system-message-header">
        <span className="system-message-brand" aria-hidden="true"><Bell size={20} /></span>
        <div><strong>MiBatute</strong><span>Avisos del sistema</span></div>
        <button type="button" className="system-message-close" aria-label="Cerrar aviso" onClick={onClose}><X size={19} /></button>
      </header>
      <div className="system-message-content">
        <div className="system-message-meta"><span className="system-message-severity" data-severity={message.severity}>{severity}</span>{date && <time dateTime={created.toISOString()}>{date}</time>}</div>
        <h3 id="system-message-title">{publicContactText(message.title || 'Mensaje del sistema')}</h3>
        <div className="system-message-body">
          {messageSections(message.message).map((part, index) => part.label
            ? <dl key={index}><dt>{part.label}</dt><dd><ContactText text={part.text} /></dd></dl>
            : <p key={index}><ContactText text={part.text} /></p>)}
        </div>
      </div>
      <footer className="system-message-actions">
        <div><button type="button" onClick={onToggleRead}><CheckCircle2 size={15} aria-hidden="true" />{message.read_at ? 'Marcar no leído' : 'Marcar leído'}</button>
          <button type="button" className="system-message-delete" onClick={onDelete}><Trash2 size={15} aria-hidden="true" />Borrar</button></div>
        <button type="button" className="system-message-done" onClick={onClose}>Cerrar</button>
      </footer>
    </section>
  </div>;
}
