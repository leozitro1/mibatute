import {LEGAL_READY} from '../legal/config.js';
import { useEffect, useRef, useState } from 'react';
import { CreditCard, ExternalLink, CheckCircle2, Loader2, RefreshCw, X } from 'lucide-react';
import { supabase } from '../supabase/supabaseClient';

async function requestCheckout(method = 'GET', credits, reference) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Inicia sesion para recargar.');
  const query = reference ? `?reference=${encodeURIComponent(reference)}` : '';
  const response = await fetch(`/api/wompi-checkout${query}`,{
    method, headers: { Authorization: `Bearer ${token}`, ...(method==='POST' ? { 'Content-Type':'application/json' } : {}) },
    ...(method==='POST' ? { body: JSON.stringify({ credits }) } : {}),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'No se pudo consultar Wompi.');
  return result;
}

export default function WompiTopupDialog({ onClose, onConfirmed }) {
  const [data,setData] = useState(null);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const inFlight = useRef(false);
  useEffect(() => {
    let active = true;
    requestCheckout().then(result => { if (active) setData(result); })
      .catch(err => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active=false; };
  }, []);
  useEffect(() => {
    const close = event => { if (event.key==='Escape' && !loading) onClose(); };
    document.addEventListener('keydown',close);
    return () => document.removeEventListener('keydown',close);
  }, [loading,onClose]);

  const perform = async credits => {
    if (inFlight.current) return;
    inFlight.current=true;
    setLoading(true); setError('');
    try {
      const result = await requestCheckout(credits ? 'POST' : 'GET',credits,credits ? null : data.order?.reference);
      setData(previous => ({ ...previous,...result }));
      if (result.order?.state==='approved') onConfirmed(result.balance);
    } catch (err) { setError(err.message); }
    finally { inFlight.current=false; setLoading(false); }
  };
  const order = data?.order;
  return (
    <div className="marketplace-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => { if (!loading) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="wompi-topup-title" className="marketplace-surface marketplace-modal relative max-h-[90dvh] w-full max-w-sm overflow-y-auto rounded-lg bg-white p-5 shadow-xl" onClick={event => event.stopPropagation()}>
        <button type="button" aria-label="Cerrar recarga" title="Cerrar recarga" disabled={loading} onClick={onClose} className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center text-gray-500 disabled:opacity-40"><X size={20} /></button>
        <CreditCard size={24} className="mb-3 text-forest-green" aria-hidden="true" />
        <h2 id="wompi-topup-title" className="pr-9 text-lg font-black text-gray-800">Recargar con Wompi</h2>
        {data?.environment==='test' && <p className="mt-2 text-xs font-semibold text-amber-800">Ambiente de pruebas. No se cobra dinero real.</p>}
        {loading && <p role="status" className="my-4 flex items-center gap-2 text-sm text-gray-500"><Loader2 size={16} className="animate-spin" /> Consultando recarga...</p>}
        {error && <p role="alert" className="my-3 text-sm text-red-600">{error}</p>}
        {data && !data.configured && <p role="status" className="my-4 text-sm text-gray-600">Las recargas están temporalmente deshabilitadas mientras configuramos Wompi.</p>}
        {!order ? <>
          <p className="my-4 text-sm text-gray-500">Cada crédito cuesta $1.000 COP. <a href="/pagos" target="_blank" rel="noopener noreferrer" className="underline">Ver condiciones de pagos y devoluciones</a>.</p>{!LEGAL_READY&&<p role="status" className="my-3 text-sm text-amber-900">Las nuevas recargas estarán disponibles cuando se publiquen sus condiciones definitivas.</p>}
          <div className="space-y-3">
            {[2,5,10].map(credits => <button key={credits} type="button" disabled={loading || !data?.configured || !LEGAL_READY}
              onClick={() => perform(credits)} className="flex min-h-12 w-full items-center justify-between gap-3 rounded-lg border border-gray-200 px-4 py-3 font-bold text-gray-700 hover:border-forest-green disabled:cursor-not-allowed disabled:opacity-40">
              <span>{credits} créditos</span><span className="text-sm">${(credits*1000).toLocaleString('es-CO')} COP</span>
            </button>)}
          </div>
        </> : <>
          <div className="my-4 border-y border-gray-200 py-3 text-sm">
            <p className="flex justify-between gap-3"><span className="text-gray-500">Paquete</span><strong>{order.credits} créditos</strong></p>
            <p className="mt-2 flex justify-between gap-3"><span className="text-gray-500">Total</span><strong>${(order.amount_in_cents/100).toLocaleString('es-CO')} COP</strong></p>
          </div>
          {order.state==='approved' ? <p role="status" className="my-4 flex items-center gap-2 text-sm font-semibold text-forest-green"><CheckCircle2 size={18} />{data.environment==='test' ? 'Pago de prueba confirmado.' : 'Pago confirmado. Tus créditos ya están disponibles.'}</p> : <>
            {data.checkoutUrl ? <a href={data.checkoutUrl} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-forest-green px-4 py-3 font-bold text-white"><ExternalLink size={16} /> Pagar en Wompi</a>
              : <p className="text-sm text-gray-600">El enlace de pago venció. Puedes preparar una nueva recarga.</p>}
            <button type="button" disabled={loading} onClick={() => perform()} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-gray-200 text-sm font-semibold text-gray-700 disabled:opacity-40"><RefreshCw size={16} /> Verificar pago</button>
            <p className="mt-3 text-xs text-gray-500">Los créditos se confirman cuando Wompi aprueba el pago. Si el pago fue rechazado, no se abonan créditos.</p>
          </>}
          <button type="button" disabled={loading} onClick={() => setData(previous => ({ ...previous,order:null,checkoutUrl:null }))} className="mt-3 min-h-11 w-full text-sm font-semibold text-gray-600">Elegir otro paquete</button>
        </>}
      </section>
    </div>
  );
}
