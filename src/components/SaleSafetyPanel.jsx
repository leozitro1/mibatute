import { useEffect, useId, useRef, useState } from 'react';
import { PackageCheck, RefreshCw } from 'lucide-react';
import { supabase } from '../supabase/supabaseClient';
import { listenMarketSignals, singleFlight } from './marketSignals.js';
import { saleSafetyAction, saleSafetyStatus } from '../supabase/saleSafety';

const button = 'inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#d9e3d5] bg-white px-3 py-2 text-xs font-semibold text-[#315b28] disabled:opacity-50';
export default function SaleSafetyPanel({ articleId, chatId = null, onUpdated }) {
  const [state, setState] = useState(null);
  const [form, setForm] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const request = useRef(null);
  const active = useRef(false);
  const working = useRef(false);
  const id = useId();
  useEffect(() => {
    active.current = true;
    const key = `${articleId}:${chatId}`;
    if (request.current?.key !== key) request.current = { key, promise: saleSafetyStatus(supabase, articleId, chatId) };
    let current = true;
    request.current.promise.then(value => { if (current) setState(value); }).catch(err => { if (current) setError(err.message); });
    return () => { current = false; active.current = false; };
  }, [articleId, chatId]);
  useEffect(() => {
    let mounted = true;
    const read = singleFlight(async () => {
      try { const value = await saleSafetyStatus(supabase, articleId, chatId); if (mounted) setState(value); }
      catch (err) { if (mounted) setError(err.message); }
    });
    const stop = listenMarketSignals(signal => {
      if (signal.kind === 'sale_safety' && signal.articleId === articleId && (!chatId || signal.chatId === chatId)) read();
    });
    return () => { mounted = false; stop(); };
  }, [articleId, chatId]);
  const refresh = async () => {
    if (working.current) return;
    working.current = true; setBusy(true); setError('');
    try { const value = await saleSafetyStatus(supabase, articleId, chatId); if (active.current) setState(value); }
    catch (err) { if (active.current) setError(err.message); }
    finally { working.current = false; if (active.current) setBusy(false); }
  };
  const submit = async event => {
    event.preventDefault();
    if (working.current) return;
    working.current = true; setBusy(true); setError('');
    try {
      const result = await saleSafetyAction(supabase, state, form, reason);
      if (!active.current) return;
      setState(result.state); setNotice(result.notice); setForm(''); setReason('');
      await onUpdated?.(result);
    } catch (err) { if (active.current) setError(err.message); }
    finally { working.current = false; if (active.current) setBusy(false); }
  };
  const open = action => { setForm(action); setReason(''); setError(''); setNotice(''); };
  return <section className="mx-4 my-3 rounded-xl border border-[#dce6d7] bg-[#f7f9f5] p-3 text-xs text-gray-600" aria-label="Estado de la reserva">
    <div className="flex items-center justify-between gap-2"><strong className="flex items-center gap-1.5 text-[#315b28]"><PackageCheck size={15} />Estado de la reserva</strong><button type="button" className={button} disabled={busy} onClick={refresh} aria-label="Actualizar estado de la reserva"><RefreshCw size={13} /></button></div>
    {!state && !error && <p className="mt-2" role="status">Comprobando reserva…</p>}
    {state && <>
      <p className="mt-2">{state.active ? 'Esta reserva está activa.' : state.paused ? 'Existe una revisión anterior pendiente. Contacta a MiBatute desde el buzón.' : 'Esta reserva ha finalizado.'}</p>
      {state.cancelReason && <p className="mt-2">Motivo de cancelación: {state.cancelReason}</p>}
      {state.blocked && <p className="mt-2">Este comprador no puede reservar de nuevo esta publicación.</p>}
      {state.active && !form && <button type="button" className={`${button} mt-3`} disabled={busy} onClick={() => open('cancel')}>Cancelar reserva</button>}
      {form && <form onSubmit={submit} className="mt-3 space-y-2">
        <p>¿Quieres cancelar la reserva? El artículo volverá a estar disponible.{state.isBuyer && ' Si utilizaste un crédito para reservar, no se devuelve al retirarte.'}</p>
        <label className="block font-semibold" htmlFor={id}>Motivo (opcional)</label>
        <textarea id={id} value={reason} onChange={event => setReason(event.target.value)} maxLength={500} rows={3} className="w-full rounded-lg border border-gray-300 bg-white p-2 text-sm" />
        <div className="flex flex-wrap gap-2"><button type="submit" className={button} disabled={busy}>{busy ? 'Cancelando…' : 'Sí, cancelar reserva'}</button><button type="button" className={button} disabled={busy} onClick={() => setForm('')}>Volver</button></div>
      </form>}
    </>}
    <p className="mt-3">Acuerda el pago y la entrega con la otra persona. MiBatute no recibe ni verifica los pagos entre usuarios.</p>
    {notice && <p className="mt-2" role="status">{notice}</p>}
    {error && <p className="mt-2 text-red-700" role="alert">{error}</p>}
  </section>;
}
