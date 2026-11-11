import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ShieldCheck, X } from 'lucide-react';
import SaleSafetyPanel from './SaleSafetyPanel.jsx';
import './SaleSafetyDialog.css';

export default function SaleSafetyDialog({ articleId, chatId, title, onUpdated, onOpenChat, canMarkDelivered, onClose }) {
  const dialog = useRef(null);
  const heading = useId();
  useEffect(() => {
    const previous = document.activeElement;
    const node = dialog.current;
    if (!node.open) node.showModal();
    return () => { if (node.open) node.close(); if (previous?.isConnected) previous.focus(); };
  }, []);
  return createPortal(<dialog ref={dialog} className="sale-safety-dialog" aria-labelledby={heading}
    onCancel={event => { event.preventDefault(); event.stopPropagation(); onClose(); }}
    onKeyDown={event => event.stopPropagation()}
    onClick={event => { event.stopPropagation(); if (event.target === event.currentTarget) onClose(); }}>
    <div className="sale-safety-dialog-surface">
      <header className="sale-safety-dialog-heading">
        <div><h2 id={heading}><ShieldCheck size={18} aria-hidden="true" />Seguridad de la venta</h2>{title && <p>{title}</p>}</div>
        <button type="button" className="site-icon-close inline-flex items-center justify-center h-9 w-9 shrink-0 rounded-lg hover:bg-gray-100" onClick={onClose} aria-label="Cerrar opciones de seguridad"><X size={20} /></button>
      </header>
      <div className="sale-safety-dialog-content">
        <SaleSafetyPanel articleId={articleId} chatId={chatId} onUpdated={onUpdated} canMarkDelivered={canMarkDelivered}
          onOpenChat={onOpenChat && (() => { onClose(); onOpenChat(); })} />
      </div>
      <footer><button type="button" className="profile-delivery-button profile-delivery-chat" onClick={onClose}>Cerrar</button></footer>
    </div>
  </dialog>, document.body);
}
