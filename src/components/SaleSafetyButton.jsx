import { lazy, Suspense, useState } from 'react';
import { PackageCheck } from 'lucide-react';

const SaleSafetyDialog = lazy(() => import('./SaleSafetyDialog.jsx'));

export default function SaleSafetyButton({ articleId, chatId = null, title, onUpdated, iconOnly = false, disabled = false, className = 'profile-delivery-button profile-delivery-chat' }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" data-sale-safety className={className} disabled={disabled}
      aria-label="Estado de la reserva" title="Estado de la reserva" aria-haspopup="dialog"
      onPointerDown={event => event.stopPropagation()} onMouseDown={event => event.stopPropagation()}
      onClick={event => { event.stopPropagation(); setOpen(true); }}>
      <PackageCheck size={16} aria-hidden="true" />{!iconOnly && 'Reserva'}
    </button>
    {open && <Suspense fallback={<span role="status" className="text-xs text-gray-500">Cargando reserva…</span>}>
      <SaleSafetyDialog articleId={articleId} chatId={chatId} title={title} onUpdated={onUpdated} onClose={() => setOpen(false)} />
    </Suspense>}
  </>;
}
