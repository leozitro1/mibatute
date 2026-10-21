import { useCallback, useEffect, useState } from 'react';
import { MapPin, Plus, Check, Pause, RefreshCw } from 'lucide-react';
import { staffRpc } from './staffClient.js';
import { refreshLocations } from '../data/useLocations.js';
import './StaffLocations.css';

export default function StaffLocations({ onReady, onAccessExpired }) {
  const [cities, setCities] = useState([]), [busy, setBusy] = useState(true);
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [cityName, setCityName] = useState(''), [firstLocality, setFirstLocality] = useState('');
  const [selected, setSelected] = useState(''), [locality, setLocality] = useState('');
  const fail = useCallback(err => {
    setError(err.message || 'No se pudo guardar.');
    if (err.code === '42501') onAccessExpired('La sesión venció. Verifica nuevamente tu acceso.');
  }, [onAccessExpired]);
  const load = useCallback(async () => {
    setBusy(true); setError('');
    try { setCities(await staffRpc('staff_location_catalog')); onReady(); }
    catch (err) { fail(err); }
    finally { setBusy(false); }
  }, [onReady, fail]);
  useEffect(() => {
    // A single initial read; changes return the updated list in the same save request.
    let active = true;
    staffRpc('staff_location_catalog').then(rows => {
      if (active) { setCities(rows); setBusy(false); onReady(); }
    }).catch(err => { if (active) { fail(err); setBusy(false); } });
    return () => { active = false; };
  }, [onReady, fail]);
  const save = async (args, success) => {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      setCities(await staffRpc('staff_location_save', args));
      setNotice(success); onReady();
      if (args.p_action === 'add_city') { setCityName(''); setFirstLocality(''); }
      if (args.p_action === 'add_locality') setLocality('');
      try { await refreshLocations(true); }
      catch { setNotice(`${success} Recarga la página para actualizar los selectores.`); }
    } catch (err) { fail(err); }
    finally { setBusy(false); }
  };
  const activeCount = cities.filter(city => city.active).length;
  return <section className="staff-locations" aria-label="Administrar ciudades y localidades">
    <p className="staff-item-detail">Las ciudades activas aparecen en registro, perfiles, publicaciones y búsquedas. Añade localidades antes de activar una ciudad. Al desactivar se retira la ciudad de esos selectores; sus usuarios y publicaciones se conservan. Siempre debe quedar una ciudad activa.</p>
    {error && <p role="alert" className="staff-location-error">{error}</p>}
    {notice && <p role="status" className="staff-location-notice">{notice}</p>}
    <div className="staff-location-forms">
      <form onSubmit={event => { event.preventDefault(); save({ p_action: 'add_city', p_name: cityName, p_locality: firstLocality }, 'Ciudad creada y activa para publicar.'); }}>
        <h2><MapPin size={18} />Añadir ciudad</h2>
        <p className="staff-item-detail">Se activará con su primera localidad al guardar.</p>
        <label htmlFor="new-market-city">Nombre de la ciudad</label>
        <input id="new-market-city" value={cityName} onChange={event => setCityName(event.target.value)} minLength={2} maxLength={80} required disabled={busy} placeholder="Ej.: Bucaramanga" />
        <label htmlFor="first-market-locality">Primera localidad o zona</label>
        <input id="first-market-locality" value={firstLocality} onChange={event => setFirstLocality(event.target.value)} minLength={2} maxLength={80} required disabled={busy} placeholder="Ej.: Cabecera" />
        <button className="staff-button staff-button-primary" disabled={busy || !cityName.trim() || !firstLocality.trim()}><Plus size={16} />Añadir y activar ciudad</button>
      </form>
      <form onSubmit={event => { event.preventDefault(); save({ p_action: 'add_locality', p_city_id: selected, p_name: locality }, 'Localidad añadida.'); }}>
        <h2><Plus size={18} />Añadir localidad</h2>
        <p className="staff-item-detail">En una ciudad activa estará disponible al guardar.</p>
        <label htmlFor="market-locality-city">Ciudad</label>
        <select id="market-locality-city" value={selected} onChange={event => setSelected(event.target.value)} required disabled={busy}>
          <option value="">Selecciona una ciudad</option>
          {cities.map(city => <option key={city.id} value={city.id}>{city.city}{city.active ? '' : ' (pendiente de activar)'}</option>)}
        </select>
        <label htmlFor="new-market-locality">Nombre de la localidad o zona</label>
        <input id="new-market-locality" value={locality} onChange={event => setLocality(event.target.value)} minLength={2} maxLength={80} required disabled={busy} />
        <button className="staff-button staff-button-primary" disabled={busy || !selected || !locality.trim()}><Plus size={16} />Añadir localidad</button>
      </form>
    </div>
    <div className="staff-location-list-heading"><h2>Ciudades configuradas</h2><button type="button" className="staff-button" onClick={load} disabled={busy}><RefreshCw size={15} />Actualizar</button></div>
    {busy && <p role="status">Cargando…</p>}
    <div className="staff-location-list">{cities.map(city => <article key={city.id}>
      <header><h3>{city.city}</h3><span className={`staff-badge ${city.active ? '' : 'staff-badge-muted'}`}>{city.active ? 'Activa' : 'Inactiva'}</span></header>
      <p className="staff-item-detail">{city.localities.length} localidades o zonas</p>
      <ul>{city.localities.map(name => <li key={name}>{name}</li>)}</ul>
      {city.active && <button type="button" className="staff-button" disabled={busy || activeCount <= 1} title={activeCount <= 1 ? 'Debe quedar al menos una ciudad activa' : undefined} onClick={() => save({ p_action: 'deactivate_city', p_city_id: city.id }, `${city.city} está desactivada. Se conservan sus usuarios y publicaciones.`)}><Pause size={16} />Desactivar {city.city}</button>}
      {!city.active && <button type="button" className="staff-button" disabled={busy || !city.localities.length} onClick={() => save({ p_action: 'activate_city', p_city_id: city.id }, `${city.city} ya está disponible para publicar.`)}><Check size={16} />Activar {city.city}</button>}
    </article>)}</div>
  </section>;
}
