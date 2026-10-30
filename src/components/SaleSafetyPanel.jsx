import { useEffect, useId, useRef, useState } from 'react';
import { ShieldCheck, RefreshCw } from 'lucide-react';
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
  return <section className="mx-4 my-3 rounded-xl border border-[#dce6d7] bg-[#f7f9f5] p-3 text-xs text-gray-600" aria-label="Seguridad de la reserva">
    <div className="flex items-center justify-between gap-2"><strong className="flex items-center gap-1.5 text-[#315b28]"><ShieldCheck size={15} />Seguridad de la venta</strong><button type="button" className={button} disabled={busy} onClick={refresh} aria-label="Actualizar estado de la reserva"><RefreshCw size={13} /></button></div>
    {!state && !error && <p className="mt-2" role="status">Comprobando reserva…</p>}
    {state && <>
      {state.paymentDeclaredAt && <p className="mt-2">El comprador declaró un pago. Es una declaración sin verificar, no una confirmación de MiBatute.</p>}
      {state.caseStatus === 'open' && <p className="mt-2 font-semibold text-amber-800">Caso en revisión por administración.{state.paused ? ' La publicación está pausada.' : ''}</p>}
      {state.cancelReason && <p className="mt-2">Motivo de cancelación: {state.cancelReason}</p>}
      {state.resolution && <p className="mt-2">Respuesta de administración: {state.resolution}</p>}
      {state.blocked && <p className="mt-2">Este comprador no puede reservar de nuevo esta publicación. Puede solicitar revisión.</p>}
      {state.caseStatus !== 'open' && <div className="mt-3 flex flex-wrap gap-2">
        {state.active && <button type="button" className={button} disabled={busy} onClick={() => open('cancel')}>Cancelar reserva</button>}
        {state.isBuyer && state.active && !state.paymentDeclaredAt && <button type="button" className={button} disabled={busy} onClick={() => open('declare_payment')}>Ya pagué</button>}
        {state.isBuyer && state.caseStatus !== 'resolved' && <button type="button" className={button} disabled={busy} onClick={() => open('payment_problem')}>Pagué y necesito revisión</button>}
        {state.isBuyer && state.blocked && state.caseStatus !== 'resolved' && <button type="button" className={button} disabled={busy} onClick={() => open('review_cancellation')}>Revisar cancelación</button>}
      </div>}
      {state.caseStatus === 'open' && state.caseKind === 'cancellation' && state.isBuyer && <button type="button" className={`${button} mt-3`} disabled={busy} onClick={() => open('payment_problem')}>También necesito informar un pago</button>}
      {form && <form onSubmit={submit} className="mt-3 space-y-2">
        <p>{form === 'cancel' ? 'Indica por qué cancelas. Si hay un pago declarado, se abrirá una revisión. Si cancela el vendedor sin pago declarado, el artículo vuelve a estar disponible y este comprador queda bloqueado para esta publicación.' : form === 'declare_payment' ? 'Confirma únicamente si ya realizaste el pago. MiBatute no lo verifica, no recibe ese dinero y no garantiza su devolución. Ante un problema, solicita revisión.' : form === 'payment_problem' ? 'Explica el pago y el problema. No incluyas claves ni datos bancarios. Administración revisará las declaraciones y el historial; no se confirma ni devuelve dinero automáticamente.' : 'Explica por qué solicitas revisar la cancelación. El bloqueo se mantiene hasta la decisión de administración.'}</p>
        {form !== 'declare_payment' && <><label className="block font-semibold" htmlFor={id}>Motivo</label><textarea id={id} value={reason} onChange={event => setReason(event.target.value)} required minLength={8} maxLength={500} rows={3} className="w-full rounded-lg border border-gray-300 bg-white p-2 text-sm" /><p className="text-right">{reason.length}/500</p></>}
        <div className="flex flex-wrap gap-2"><button type="submit" className={button} disabled={busy}>{busy ? 'Guardando…' : 'Confirmar'}</button><button type="button" className={button} disabled={busy} onClick={() => setForm('')}>Volver</button></div>
      </form>}
    </>}
    {notice && <p className="mt-2" role="status">{notice}</p>}
    {error && <p className="mt-2 text-red-700" role="alert">{error}</p>}
  </section>;
}
