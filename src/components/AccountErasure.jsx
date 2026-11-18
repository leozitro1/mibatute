import { useState } from 'react';

const labels = {
  articulos: 'Publicaciones, reservas o entregas',
  chats: 'Conversaciones',
  chat_messages: 'Mensajes',
  reports: 'Reportes',
  chat_reports: 'Reportes de chat',
  reputacion: 'Calificaciones',
  image_upload_limits: 'Historial de carga de imágenes',
  wompi_topups: 'Recargas',
  support_threads: 'Solicitudes de soporte',
};

export default function AccountErasure({ row, rpc, onCompleted }) {
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function run(confirm) {
    if (busy) return;
    if (confirm && !window.confirm(preview?.closureKind === 'sanctioned'
      ? '¿Suprimir esta cuenta? La sanción de registro del correo continuará hasta su vencimiento o revisión.'
      : '¿Suprimir esta cuenta de forma definitiva? La persona podrá volver a registrarse. Conserva el radicado para comunicar el resultado.')) return;
    setBusy(true);
    setError('');
    try {
      const result = await rpc('staff_account_erasure', {
        p_request: row.id,
        p_revision: row.work_revision,
        p_confirm: confirm,
      });
      setPreview(result);
      if (result.erasedAt) onCompleted();
    } catch (failure) {
      setError(failure.message || 'No se pudo completar la operación.');
      setPreview(null);
    } finally {
      setBusy(false);
    }
  }

  const blockers = preview?.blockers;
  return <section className="legal-case-work" aria-label="Supresión de cuenta">
    <button type="button" className="support-button" onClick={() => run(false)} disabled={busy}>Revisar supresión</button>
    {preview && !preview.requiresSanctionReview && <p className="support-hint">{preview.closureKind === 'sanctioned'
      ? `Cierre con sanción. El correo seguirá bloqueado hasta ${new Date(preview.sanctionExpiresAt).toLocaleString('es-CO', { timeZone: 'America/Bogota' })}.`
      : 'Cierre voluntario. La persona podrá volver a registrarse.'}</p>}
    {preview?.requiresSanctionReview && <p role="status" className="support-error">Esta cuenta está bloqueada. Registra o revisa la sanción del correo en Usuarios antes de suprimirla.</p>}
    {error && <p role="alert" className="support-error">{error}</p>}
    {!!blockers?.length && <>
      <p className="support-hint">Requiere revisión manual de los registros asociados.</p>
      <ul>{blockers.map(item => <li key={item}>{labels[item] || item}</li>)}</ul>
    </>}
    {blockers?.length === 0 && !preview.requiresSanctionReview && <p className="support-hint">
      {preview.enabled ? 'La cuenta cumple las condiciones del borrado desde este panel.' : 'La ejecución está deshabilitada en este entorno.'}
    </p>}
    {preview?.enabled && !preview.requiresSanctionReview && blockers?.length === 0 && <button type="button" className="support-button"
      onClick={() => run(true)} disabled={busy}>Suprimir cuenta</button>}
  </section>;
}
