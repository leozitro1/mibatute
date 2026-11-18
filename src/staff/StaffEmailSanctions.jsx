import { bogotaIso } from '../sponsors/model.js';
import { useState } from 'react';
import { staffRpc } from './staffClient.js';

export default function StaffEmailSanctions() {
  const [email, setEmail] = useState('');
  const [reason, setReason] = useState('');
  const [expires, setExpires] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function run(action) {
    if (busy) return;
    if (action !== 'lookup' && !window.confirm(action === 'block'
      ? '¿Impedir el registro con este correo hasta la fecha indicada, incluso después del cierre de la cuenta?'
      : '¿Levantar la sanción de registro de este correo?')) return;
    setBusy(true);
    setError('');
    try {
      const data = await staffRpc('staff_email_sanction', {
        p_email: email.trim(), p_action: action, p_reason: reason,
        p_expires_at: action === 'block' ? bogotaIso(expires) : null,
      });
      setResult({ email: email.trim(), data });
    } catch (failure) {
      setError(failure.message || 'No se pudo consultar la sanción.');
    } finally {
      setBusy(false);
    }
  }

  return <details className="legal-case-work">
    <summary>Sanciones de registro por correo</summary>
    <p>El cierre voluntario permite volver a registrarse. Una sanción vigente impide registrar el mismo correo hasta su vencimiento o revisión.</p>
    <form className="support-compose" onSubmit={event => { event.preventDefault(); run('lookup'); }}>
      <label>Correo de la cuenta<input type="email" required maxLength={254} value={email} disabled={busy}
        onChange={event => { setEmail(event.target.value); setResult(null); }} /></label>
      <button type="submit" className="staff-button" disabled={busy}>Consultar sanción</button>
      <label>Motivo de la decisión<textarea value={reason} maxLength={500} disabled={busy}
        onChange={event => setReason(event.target.value)} /></label>
      <label>Vencimiento de la sanción (hora de Bogotá)<input type="datetime-local" value={expires} disabled={busy}
        onChange={event => setExpires(event.target.value)} /></label>
      <p>Para imponerla, la cuenta debe estar bloqueada previamente desde Usuarios. Para revisarla después del cierre, consulta el mismo correo.</p>
      <div className="support-actions">
        <button type="button" className="staff-button" onClick={() => run('block')}
          disabled={busy || !email.trim() || reason.trim().length < 10 || !(Date.parse(bogotaIso(expires)) > Date.now())}>Bloquear nuevo registro</button>
        <button type="button" className="staff-button" onClick={() => run('revoke')}
          disabled={busy || !result?.data.active || reason.trim().length < 10}>Levantar sanción de registro</button>
      </div>
      {error && <p role="alert" className="staff-error">{error}</p>}
      {result && <div role="status">
        <strong>{result.data.active ? 'Sanción de registro vigente' : 'Sin sanción de registro vigente'}</strong>
        {result.data.reason && <p>{result.data.reason}</p>}
        {result.data.imposedAt && <p>Registrada el {new Date(result.data.imposedAt).toLocaleString('es-CO', { timeZone: 'America/Bogota' })}</p>}
        {result.data.expiresAt && <p>Vence el {new Date(result.data.expiresAt).toLocaleString('es-CO', { timeZone: 'America/Bogota' })}</p>}
        {result.data.revokedAt && <p>Levantada el {new Date(result.data.revokedAt).toLocaleString('es-CO', { timeZone: 'America/Bogota' })}</p>}
      </div>}
    </form>
  </details>;
}
