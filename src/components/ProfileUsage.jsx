import { useEffect, useState } from 'react';
import { Clock3, Package, HandHeart, Gift } from 'lucide-react';
import { publicationStatus } from '../supabase/publicationCredits.js';
import { donationStatus } from '../supabase/donationApplications.js';
import { listenMarketSignals } from './marketSignals.js';
import './ProfileUsage.css';

function FreeRequestClock({ deadline }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.ceil((Date.parse(deadline) - now) / 1000));
  if (!Number.isFinite(seconds)) return null;
  const time = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
    .map(value => String(value).padStart(2, '0')).join(':');
  return <p className="profile-usage-clock"><Clock3 size={12} aria-hidden="true" />
    {seconds > 0 ? <>Gratis en <strong role="timer" aria-live="off">{time}</strong></> : 'Actualizando…'}
  </p>;
}

function UsageBar({ label, used, limit, icon }) {
  return <>
    <div className="profile-usage-label"><h3><span className="profile-usage-icon" aria-hidden="true">{icon}</span>{label}</h3><strong aria-label={`${used} de ${limit}`}>{used}/{limit}</strong></div>
    <progress aria-label={label} value={Math.min(used, limit)} max={limit} />
  </>;
}

export default function ProfileUsage({ id, client, userId, refreshKey, expanded = false }) {
  const [status, setStatus] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true, busy = false, queued = false, timer;
    async function refresh() {
      if (busy) { queued = true; return; }
      busy = true;
      clearTimeout(timer);
      try {
        const [sales, donations] = await Promise.all([publicationStatus(client), donationStatus(client)]);
        if (!alive) return;
        setStatus({ sales, donations });
        setFailed(false);
        const deadlines = [!donations.freeAvailable && donations.nextFreeAt, sales.nextSlotReleaseAt]
          .map(value => Date.parse(value)).filter(Number.isFinite);
        const deadline = Math.min(...deadlines);
        if (Number.isFinite(deadline)) {
          timer = setTimeout(refresh, deadline > Date.now() ? deadline - Date.now() + 250 : 60000);
        }
      } catch {
        if (alive) { setFailed(true); timer = setTimeout(refresh, 60000); }
      } finally {
        busy = false;
        if (alive && queued) { queued = false; refresh(); }
      }
    }
    refresh();
    const stop = listenMarketSignals(signal => {
      if (signal.uid === userId && ['article', 'application', 'reconnect'].includes(signal.kind)) refresh();
    });
    window.addEventListener('focus', refresh);
    return () => { alive = false; clearTimeout(timer); stop(); window.removeEventListener('focus', refresh); };
  }, [client, userId, refreshKey]);

  const sales = status?.sales, donations = status?.donations;
  return <section id={id} className={`profile-usage${expanded ? ' is-expanded' : ''}`} aria-label="Tus cupos gratuitos">
    {failed ? <p role="status">No pudimos actualizar tus cupos. Lo intentaremos de nuevo.</p>
      : !status ? <p role="status">Consultando tus cupos…</p> : <>
        <div className="profile-usage-columns">
          <div>
            <UsageBar label="Publicaciones" used={sales.occupied ?? sales.active} limit={sales.freeLimit} icon={<Package size={15} strokeWidth={1.7} />} />
            <small>{sales.freeRemaining > 0 ? 'Ventas · cupos gratuitos' : 'Otra venta: 1 crédito o libera un cupo'}</small>
          </div>
          {Number.isInteger(sales.donationActive) && <div>
            <UsageBar label="Donaciones" used={sales.donationOccupied ?? sales.donationActive} limit={sales.donationLimit} icon={<Gift size={15} strokeWidth={1.7} />} />
            <small>{sales.donationRemaining === 0 ? 'Libera un cupo para donar otro artículo' : 'Donaciones · cupos gratuitos'}</small>
          </div>}
          <div>
            <UsageBar label="Postulaciones" used={donations.freeUsed} limit={donations.freeLimit} icon={<HandHeart size={15} strokeWidth={1.7} />} />
            {expanded && !donations.freeAvailable && donations.nextFreeAt
              ? <FreeRequestClock key={donations.nextFreeAt} deadline={donations.nextFreeAt} />
              : <small>Donaciones · últimas 24 h</small>}
          </div>
        </div>
        {(sales.heldSales > 0 || sales.heldDonations > 0) && <p className="profile-usage-retained">Por avisos eliminados: {sales.heldSales} cupos de venta y {sales.heldDonations} de donación retenidos.
          {sales.nextSlotReleaseAt && <> Próximo cupo libre: {new Date(sales.nextSlotReleaseAt).toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'medium', timeStyle: 'short' })}.</>}
        </p>}
        <details className="profile-usage-help">
          <summary>Cómo funcionan tus cupos</summary>
          <p><strong>Ventas:</strong> {sales.freeRemaining > 0 ? `Puedes publicar ${sales.freeRemaining} más gratis.`
            : 'Tus cupos gratuitos están ocupados. Otra venta requiere 1 crédito.'} Finalizar una venta libera espacio; pausarla o reservarla no.</p>
          <p>{sales.donationBonus ? 'Tienes un cuarto cupo por tu donación disponible.'
            : 'Una donación disponible con foto y descripción habilita un cuarto cupo.'} Puedes tener máximo 3 donaciones activas gratis; las pausadas y reservadas también cuentan. Entregar o dejar vencer una libera espacio. No se permite exigir dinero ni ocultar precios.</p>
          <p><strong>Al eliminar un aviso:</strong> durante las primeras 12 horas recuperas el cupo inmediatamente. Después, el cupo queda ocupado 10 días desde la eliminación. Los créditos usados no se devuelven por borrar.</p>
          <p><strong>Postulaciones:</strong> tienes {donations.freeLimit} gratuitas en las últimas 24 horas. Cada cupo se recupera 24 horas después de utilizarlo. Cancelar o recibir un rechazo no recupera el cupo gratuito.</p>
          <p>{donations.pending} de {donations.maxPending} solicitudes pendientes.
            {donations.pending >= donations.maxPending ? ' Espera a resolver una antes de enviar otra.' : ' Una postulación adicional requiere 1 crédito.'}</p>
        </details>
      </>}
  </section>;
}
