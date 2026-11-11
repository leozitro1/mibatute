import { useEffect, useId, useRef, useState } from 'react';
import { CheckCircle2, CircleX, Flag, MessageCircle, RefreshCw, ShieldCheck, UserRound } from 'lucide-react';
import { supabase } from '../supabase/supabaseClient';
import { listenMarketSignals, singleFlight } from './marketSignals.js';
import { saleSafetyAction, saleSafetyStatus } from '../supabase/saleSafety';
import { submitArticleReport, submitChatReport } from '../supabase/reports';
import { transitionSale } from '../supabase/saleTransaction';

const actionButton = 'flex min-h-12 min-w-0 items-center gap-3 rounded-xl border bg-white px-3 py-2 text-left text-sm font-semibold leading-tight transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest-green disabled:cursor-not-allowed disabled:opacity-50 sm:flex-col sm:justify-center sm:gap-2 sm:text-center';
const reportButton = `${actionButton} border-[#d9e3d5] text-forest-green enabled:hover:border-forest-green enabled:hover:bg-[#f3f8f4]`;
const reportIcon = 'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-forest-green/10';
const actions = {
  deliver: { label: 'Marcar entregado', confirm: 'Confirmar entrega', pending: 'Guardando…' },
  cancel: { label: 'Cancelar venta', limit: 500, confirm: 'Confirmar cancelación', pending: 'Cancelando…' },
  reportUser: { label: 'Reportar usuario', limit: 1000, confirm: 'Enviar reporte', pending: 'Enviando…' },
  reportArticle: { label: 'Reportar publicación', limit: 400, confirm: 'Enviar reporte', pending: 'Enviando…' },
};

export default function SaleSafetyPanel({ articleId, chatId = null, onUpdated, onOpenChat, canMarkDelivered }) {
  const [state, setState] = useState(null);
  const [form, setForm] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const request = useRef(null);
  const deliveryReservation = useRef(null);
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
      if (form === 'cancel') {
        const result = await saleSafetyAction(supabase, state, form, reason);
        if (!active.current) return;
        setState(result.state); setNotice(result.notice); setForm(''); setReason('');
        await onUpdated?.(result);
      } else if (form === 'deliver') {
        const fresh = await saleSafetyStatus(supabase, articleId, chatId);
        if (!active.current) return;
        if (!canMarkDelivered || fresh.isBuyer || !fresh.active || fresh.paused || fresh.reservation !== deliveryReservation.current) {
          setState(fresh);
          setForm('');
          throw new Error('La reserva cambió. Revisa su estado antes de marcar la entrega.');
        }
        const result = await transitionSale(supabase, articleId, 'deliver');
        if (!active.current) return;
        setState({ ...fresh, active: false });
        setNotice('Entrega registrada. El chat queda en solo lectura y ya pueden calificar.');
        setForm('');
        await onUpdated?.(result);
      } else {
        const detail = reason.trim();
        // The chat report API requires at least five characters. Supply the actual source when needed.
        const chatDetail = detail.length < 5 ? `Reporte desde Seguridad de la venta. ${detail}` : detail;
        const result = form === 'reportUser'
          ? await submitChatReport(supabase, state.chat, 'otro', chatDetail)
          : await submitArticleReport(supabase, articleId, 'Otro', detail);
        if (!active.current) return;
        setNotice(result.alreadyExists ? 'Ya tienes un reporte pendiente de revisión.' : 'Reporte enviado a MiBatute.');
        setForm(''); setReason('');
      }
    } catch (err) { if (active.current) setError(err.message); }
    finally { working.current = false; if (active.current) setBusy(false); }
  };
  const open = action => {
    if (action === 'deliver') deliveryReservation.current = state.reservation;
    setForm(action); setReason(''); setError(''); setNotice('');
  };
  return <section className="mx-4 my-3 rounded-xl border border-[#dce6d7] bg-[#f7f9f5] p-3 text-xs text-gray-600" aria-label="Acciones de seguridad">
    <div className="flex items-center justify-between gap-2"><strong className="flex items-center gap-1.5 text-[#315b28]"><ShieldCheck size={15} aria-hidden="true" />Acciones</strong><button type="button" className="profile-delivery-button profile-delivery-chat w-11" disabled={busy} onClick={refresh} aria-label="Actualizar acciones de seguridad"><RefreshCw size={16} aria-hidden="true" /></button></div>
    {!state && !error && <p className="mt-2" role="status">Comprobando reserva…</p>}
    {state && <>
      <p className="mt-2">{state.active ? 'Esta reserva está activa.' : state.paused ? 'Existe una revisión anterior pendiente. Contacta a MiBatute desde el buzón.' : 'Esta reserva ha finalizado.'}</p>
      {state.cancelReason && <p className="mt-2">Motivo de cancelación: {state.cancelReason}</p>}
      {state.blocked && <p className="mt-2">Este comprador no puede reservar de nuevo esta publicación.</p>}
      {!form && <>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {onOpenChat && <button type="button" className={reportButton} disabled={busy} onClick={onOpenChat}>
            <span className={reportIcon}><MessageCircle size={18} aria-hidden="true" /></span>
            Abrir chat
          </button>}
          {canMarkDelivered && !state.isBuyer && <button type="button" className={reportButton}
            disabled={busy || !state.active || state.paused} onClick={() => open('deliver')}>
            <span className={reportIcon}><CheckCircle2 size={18} aria-hidden="true" /></span>
            {actions.deliver.label}
          </button>}
          <button type="button" className={`${actionButton} border-[#edc6c3] text-[#b42318] enabled:hover:bg-[#fff1f0]`} disabled={busy || !state.active || state.paused} onClick={() => open('cancel')}>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#fff1f0]"><CircleX size={18} aria-hidden="true" /></span>
            {actions.cancel.label}
          </button>
          <button type="button" className={reportButton} disabled={busy} onClick={() => open('reportUser')}>
            <span className={reportIcon}><UserRound size={18} aria-hidden="true" /></span>
            {actions.reportUser.label}
          </button>
          <button type="button" className={reportButton} disabled={busy || !state.isBuyer} onClick={() => open('reportArticle')}>
            <span className={reportIcon}><Flag size={18} aria-hidden="true" /></span>
            {actions.reportArticle.label}
          </button>
        </div>
        {!state.isBuyer && <p className="mt-2">Solo el comprador puede reportar este anuncio.</p>}
      </>}
      {form && <form onSubmit={submit} className="mt-3 space-y-2">
        <p className="font-semibold">{actions[form].label}</p>
        {form === 'deliver' && <p>El chat quedará en solo lectura y ambos podrán calificar la experiencia.</p>}
        {form === 'cancel' && <p>El artículo volverá a estar disponible.{state.isBuyer && ' Si utilizaste un crédito para reservar, no se devuelve al retirarte.'}</p>}
        {form === 'reportUser' && <p>El equipo recibirá el reporte de la otra persona y los últimos 20 mensajes disponibles del chat.</p>}
        {actions[form].limit && <>
          <label className="block font-semibold" htmlFor={id}>Detalle (opcional)</label>
          <textarea id={id} value={reason} onChange={event => setReason(event.target.value)} maxLength={actions[form].limit} rows={3} disabled={busy} className="w-full rounded-lg border border-gray-300 bg-white p-2 text-sm" />
        </>}
        <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
          <button type="submit" className={`profile-delivery-button ${form === 'cancel' ? 'profile-delivery-cancel' : 'profile-delivery-confirm'}`} disabled={busy}>
            {busy ? actions[form].pending : actions[form].confirm}
          </button>
          <button type="button" className="profile-delivery-button profile-delivery-chat" disabled={busy} onClick={() => setForm('')}>Volver</button>
        </div>
      </form>}
    </>}
    <p className="mt-3">Acuerda el pago y la entrega con la otra persona. MiBatute no recibe ni verifica los pagos entre usuarios.</p>
    {notice && <p className="mt-2" role="status">{notice}</p>}
    {error && <p className="mt-2 text-red-700" role="alert">{error}</p>}
  </section>;
}
