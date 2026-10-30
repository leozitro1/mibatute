import { useCallback, useEffect, useId, useRef, useState } from "react";
import { CalendarClock, Check, X, Plus, RefreshCw, Ban } from "lucide-react";
import { supabase } from "../supabase/supabaseClient";
import { singleFlight } from "./marketSignals.js";
import { bogotaDate, formatPickupSlot, pickupStatusLabel, validatePickupSlot, validatePickupPlace } from "./pickupAgreement";

const fields = "id,chat_id,proposed_by,pickup_date,start_time,end_time,pickup_place,status,confirmed_by,confirmed_at,ended_by,ended_at,created_at";
const buttonClass = "inline-flex items-center justify-center gap-1.5 rounded-md border border-gray-300 px-3 py-2 text-xs font-semibold hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed";

export default function ChatPickupAgreement({ chatId, userId, sellerId, canAct, onActivityChange }) {
  const [rows, setRows] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(null);
  const [replaceConsent, setReplaceConsent] = useState(false);
  const alive = useRef(false);
  const request = useRef(0);
  const working = useRef(false);
  const id = useId();
  const changedRows = useRef(new Map());
  const changeCallback = useRef(onActivityChange);
  changeCallback.current = onActivityChange;
  const mergeRows = rows => [...new Map(rows.map(row => [row.id, row])).values()]
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id.localeCompare(a.id)).slice(0, 10);

  const load = useCallback(async () => {
    const version = ++request.current;
    // Overlay only events arriving during this request, not an old state from
    // before a disconnect that could overwrite the fresh database snapshot.
    changedRows.current.clear();
    try {
      const result = await supabase.from("chat_pickups").select(fields).eq("chat_id", chatId)
        .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(10);
      if (!alive.current || version !== request.current) return;
      if (result.error) throw result.error;
      setRows(mergeRows([...(result.data || []), ...changedRows.current.values()]));
      setLoaded(true);
      setError("");
    } catch {
      if (alive.current && version === request.current) {
        setLoaded(false);
        setError("No se pudo cargar la recogida.");
      }
    }
  }, [chatId]);

  useEffect(() => {
    alive.current = true;
    let subscribed = false;
    changedRows.current.clear();
    const refresh = singleFlight(load);
    const fallback = setTimeout(() => { if (!subscribed) refresh(); }, 2000);
    const channel = supabase.channel(`chat_pickups_${chatId}_${userId}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "chat_pickups", filter: `chat_id=eq.${chatId}`,
      }, ({ eventType, new: row, old }) => {
        if (!alive.current) return;
        if (eventType === "DELETE") { changedRows.current.delete(old.id); setRows(previous => previous.filter(item => item.id !== old.id)); }
        else if (row?.id) {
          changedRows.current.set(row.id, row);
          setRows(previous => mergeRows([...previous, row]));
        }
      }).subscribe(status => {
        if (status === "SUBSCRIBED") { subscribed = true; clearTimeout(fallback); refresh(); }
      });
    return () => {
      clearTimeout(fallback);
      alive.current = false;
      request.current += 1;
      supabase.removeChannel(channel);
    };
  }, [chatId, userId, load]);

  const active = rows.find(row => row.status === "pending" || row.status === "confirmed");
  const displayed = active || (rows[0]?.status === "completed" ? rows[0] : null);
  const mine = active?.proposed_by === userId;
  const enabled = canAct && loaded && !busy;
  const canPropose = canAct && !!userId && userId === sellerId;
  const mutate = async (name, args) => {
    if (working.current || !enabled) return;
    working.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await supabase.rpc(name, args);
      if (result.error) throw result.error;
      if (!alive.current) return;
      setForm(null);
      changeCallback.current?.();
      if (result.data?.id) {
        changedRows.current.set(result.data.id, result.data);
        // A replacement ends the preceding active slot atomically.
        setRows(previous => mergeRows([...previous.map(row => row.id !== result.data.id && ["pending", "confirmed"].includes(row.status)
          && name === "propose_chat_pickup" ? { ...row, status: "replaced" } : row), result.data]));
      } else await load();
    } catch (failure) {
      if (!alive.current) return;
      await load();
      if (alive.current) setError(failure?.message || "No se pudo actualizar la recogida.");
    } finally {
      working.current = false;
      if (alive.current) setBusy(false);
    }
  };
  const respond = action => mutate("respond_chat_pickup", { p_pickup_id: active.id, p_action: action });
  const openForm = () => {
    if (!canPropose || !enabled) return;
    setReplaceConsent(false);
    setForm({ date: "", start: "", end: "", place: active?.pickup_place || "", replaceId: active?.id || null });
  };
  const propose = event => {
    event.preventDefault();
    if (!canPropose || !form) return;
    const message = validatePickupPlace(form.place) || validatePickupSlot(form.date, form.start, form.end);
    if (message) { setError(message); return; }
    if (form.replaceId && !replaceConsent) { setError("Confirma el reemplazo de la recogida anterior."); return; }
    mutate("propose_chat_pickup", {
      p_chat_id: chatId, p_date: form.date, p_start: form.start, p_end: form.end,
      p_replace_id: form.replaceId, p_place: form.place.trim(),
    });
  };

  if (!canPropose && rows.length === 0) return null;

  return (
    <section aria-label="Acuerdo de recogida" aria-busy={busy} className="border-b border-gray-100 bg-white px-4 py-3 text-gray-800">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><CalendarClock size={17} aria-hidden="true" />Recogida</h3>
        <span className="text-xs text-gray-500">Hora de Bogota</span>
      </div>
      {displayed ? (
        <div className="mt-2" aria-live="polite">
          <p className="text-sm break-words">{formatPickupSlot(displayed)}</p>
          {displayed.pickup_place && <p className="mt-1 text-sm break-words"><strong>Lugar:</strong> {displayed.pickup_place}</p>}
          <p className={`mt-1 text-xs ${displayed.status !== "pending" ? "text-green-700" : "text-gray-600"}`}>
            {displayed.status === "completed" ? "Recogida completada" : displayed.status === "confirmed" ? "Confirmada por ambas personas" : mine ? "Esperando confirmacion de la otra persona" : "Propuesta por la otra persona"}
          </p>
        </div>
      ) : <p className="mt-2 text-xs text-gray-500">{loaded ? "Sin recogida activa" : "Recogida no disponible"}</p>}
      {canAct && !form && (
        <div className="mt-3 flex flex-wrap gap-2">
          {active?.status === "pending" && !mine && <>
            <button type="button" className={buttonClass} disabled={!enabled} onClick={() => respond("confirm")}><Check size={15} aria-hidden="true" />Confirmar</button>
            <button type="button" className={buttonClass} disabled={!enabled} onClick={() => respond("reject")}><X size={15} aria-hidden="true" />Rechazar</button>
          </>}
          {canPropose && <button type="button" className={buttonClass} disabled={!enabled} onClick={openForm}>
            <Plus size={15} aria-hidden="true" />{active ? "Cambiar recogida" : "Proponer recogida"}
          </button>}
          {active && <button type="button" className={buttonClass} disabled={!enabled} onClick={() => respond("cancel")}><Ban size={15} aria-hidden="true" />Cancelar recogida</button>}
        </div>
      )}
      {form && canPropose && (
        <form onSubmit={propose} className="pickup-proposal-form mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <label htmlFor={`${id}-place`} className="col-span-2 min-w-0 text-xs">Lugar
              <input id={`${id}-place`} type="text" required maxLength={200} value={form.place} disabled={busy}
                placeholder="Casa, C. Comercial, parque…"
                onChange={e => setForm({ ...form, place: e.target.value })} className="mt-1 block w-full min-w-0 rounded-md border border-gray-300 px-2 py-2 text-sm" />
            </label>
            <label htmlFor={`${id}-date`} className="col-span-2 min-w-0 text-xs">Dia
              <input id={`${id}-date`} type="date" required min={bogotaDate()} value={form.date} disabled={busy}
                onChange={e => setForm({ ...form, date: e.target.value })} className="mt-1 block w-full min-w-0 rounded-md border border-gray-300 px-2 py-2 text-sm" />
            </label>
            {[['start', 'Desde'], ['end', 'Hasta']].map(([key, label]) => (
              <label key={key} htmlFor={`${id}-${key}`} className="col-span-2 sm:col-span-1 min-w-0 text-xs">{label}
                <input id={`${id}-${key}`} type="time" required step="60" value={form[key]} disabled={busy}
                  onChange={e => setForm({ ...form, [key]: e.target.value })} className="mt-1 block w-full min-w-0 rounded-md border border-gray-300 px-2 py-2 text-sm" />
              </label>
            ))}
          </div>
          {form.replaceId && <label className="flex items-start gap-2 text-xs leading-5">
            <input type="checkbox" required checked={replaceConsent} disabled={busy} onChange={e => setReplaceConsent(e.target.checked)} className="mt-1 shrink-0" />
            Reemplazar la recogida anterior. La nueva propuesta requiere otra confirmacion.
          </label>}
          <div className="pickup-proposal-actions flex flex-wrap gap-2">
            <button type="submit" className={buttonClass} disabled={!enabled}><CalendarClock size={15} aria-hidden="true" />{busy ? "Guardando..." : "Enviar propuesta"}</button>
            <button type="button" className={buttonClass} disabled={busy} onClick={() => setForm(null)}><X size={15} aria-hidden="true" />Cerrar</button>
          </div>
        </form>
      )}
      {error && <div className="mt-2 flex items-start gap-2">
        <p role="alert" className="min-w-0 break-words text-xs text-red-700">{error}</p>
        <button type="button" className="shrink-0 p-1 hover:bg-gray-100 rounded" aria-label="Actualizar recogida" title="Actualizar recogida" onClick={load} disabled={busy}><RefreshCw size={16} /></button>
      </div>}
      {rows.some(row => row !== displayed) && <details className="mt-3 text-xs">
        <summary className="cursor-pointer py-1 text-gray-600">Historial reciente</summary>
        <ul className="mt-1 divide-y divide-gray-100">
          {rows.filter(row => row !== displayed).map(row => <li key={row.id} className="py-2 break-words">
            {formatPickupSlot(row)} <span className="text-gray-500">· {pickupStatusLabel[row.status]}</span>
            {row.pickup_place && <p className="mt-1 break-words">Lugar: {row.pickup_place}</p>}
          </li>)}
        </ul>
      </details>}
    </section>
  );
}
