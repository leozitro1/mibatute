import { lazy, Suspense, useState } from 'react';
import { LockKeyhole } from 'lucide-react';

const SaleSafetyDialog = lazy(() => import('./SaleSafetyDialog.jsx'));

export default function SaleSafetyButton({ articleId, chatId = null, title, onUpdated, iconOnly = false, disabled = false, className = 'profile-delivery-button profile-delivery-chat' }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" data-sale-safety className={className} disabled={disabled}
      aria-label="Seguridad de la venta" title="Seguridad de la venta" aria-haspopup="dialog"
      onPointerDown={event => event.stopPropagation()} onMouseDown={event => event.stopPropagation()}
      onClick={event => { event.stopPropagation(); setOpen(true); }}>
      <LockKeyhole size={16} aria-hidden="true" />{!iconOnly && 'Seguridad'}
    </button>
    {open && <Suspense fallback={<span role="status" className="text-xs text-gray-500">Cargando seguridad…</span>}>
      <SaleSafetyDialog articleId={articleId} chatId={chatId} title={title} onUpdated={onUpdated} onClose={() => setOpen(false)} />
    </Suspense>}
  </>;
}
