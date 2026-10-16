import { ChevronDown } from 'lucide-react';

export default function RescueLimits({purchaseLimit,donacionLimit}) {
  if(!purchaseLimit&&!donacionLimit)return null;
  return <details className="profile-rescue-limits" aria-label="Cupos y solicitudes">
    <summary>
      <span className="profile-rescue-limits-heading"><strong>Cupos y solicitudes</strong>
        <span className="profile-rescue-limits-counts">
          {donacionLimit&&<span>Donaciones: {donacionLimit.pending} de 3 pendientes</span>}
          {purchaseLimit&&<span>Compras: {purchaseLimit.active} de 8 activas</span>}
        </span>
      </span>
      <ChevronDown size={18} className="profile-rescue-limits-chevron" aria-hidden="true" />
    </summary>
    <div className="profile-rescue-limits-content">
      {purchaseLimit&&<section aria-label="Cupos de compras">
        <h3>Compras</h3>
        <p><strong>{purchaseLimit.active}/8 compras simultáneas</strong>.</p>
        <p>{purchaseLimit.freeActive}/5 cupos gratuitos y {purchaseLimit.paidActive}/3 adicionales. Cada adicional retiene 1 crédito. Al entregar o cancelar, se libera el cupo.</p>
        <p>Solo se devuelve el crédito si rechaza o cancela el vendedor. Las donaciones tienen un límite independiente.</p>
      </section>}
      {donacionLimit&&<section aria-label="Solicitudes de donación">
        <h3>Donaciones</h3>
        <p><strong>{donacionLimit.pending}/3 solicitudes pendientes</strong>. Una solicitud gratuita cada 6 horas.</p>
        {donacionLimit.pending>=3&&<p className="font-semibold text-amber-800">Espera una decisión o cancela una solicitud antes de enviar otra.</p>}
        <p>{donacionLimit.freeAvailable?'Solicitud gratuita disponible.':`Próxima gratuita: ${new Date(donacionLimit.nextFreeAt).toLocaleString('es-CO',{timeZone:'America/Bogota'})}.`}</p>
        <p>Las adicionales retienen 1 crédito al solicitar desde el artículo. Si no eres elegido se devuelve; cancelar voluntariamente no lo devuelve.</p>
      </section>}
    </div>
  </details>;
}
