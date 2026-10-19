import {useEffect} from 'react';
import {CreditCard,X} from 'lucide-react';
import {CONTACT_EMAIL} from '../config/availability.js';

export default function WompiTopupDialog({onClose}) {
 useEffect(()=>{const close=event=>{if(event.key==='Escape')onClose();};document.addEventListener('keydown',close);return()=>document.removeEventListener('keydown',close);},[onClose]);
 return <div className="marketplace-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
  <section role="dialog" aria-modal="true" aria-labelledby="wompi-topup-title" className="marketplace-surface marketplace-modal relative w-full max-w-sm rounded-lg bg-white p-5 shadow-xl" onClick={event=>event.stopPropagation()}>
   <button type="button" aria-label="Cerrar recarga" onClick={onClose} className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center text-gray-500"><X size={20}/></button>
   <CreditCard size={24} className="mb-3 text-forest-green" aria-hidden="true"/>
   <h2 id="wompi-topup-title" className="pr-9 text-lg font-black text-gray-800">Recargas: próximamente</h2>
   <p className="my-4 text-sm text-gray-600">Las recargas están deshabilitadas durante esta etapa de pruebas. Puedes continuar usando las funciones incluidas en tu cuenta y los créditos que tengas disponibles.</p>
   <a href={`mailto:${CONTACT_EMAIL}`} className="text-sm font-semibold text-forest-green underline">Contactar a MiBatute</a>
  </section>
 </div>;
}
