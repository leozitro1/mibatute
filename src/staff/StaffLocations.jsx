import { useCallback, useEffect, useRef, useState } from 'react';
import { MapPin, Plus, Check, Pause, RefreshCw, Pencil, X, RotateCcw, Save } from 'lucide-react';
import { staffRpc } from './staffClient.js';
import { refreshLocations } from '../data/useLocations.js';
import './StaffLocations.css';

export default function StaffLocations({ onReady, onAccessExpired }) {
  const [cities, setCities] = useState([]), [busy, setBusy] = useState(true);
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [cityName, setCityName] = useState(''), [firstLocality, setFirstLocality] = useState('');
  const [selected, setSelected] = useState(''), [locality, setLocality] = useState('');
  const [editingCity, setEditingCity] = useState(''), [editName, setEditName] = useState('');
  const [newZone, setNewZone] = useState(''), [editingZone, setEditingZone] = useState(null);
  const editorRef = useRef(null);
  useEffect(() => {
    if (editingCity && editorRef.current) {
      editorRef.current.focus({ preventScroll: true });
      editorRef.current.scrollIntoView({ block: 'start' });
    }
  }, [editingCity]);
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
  const save = async (args, success, rpc = 'staff_location_save') => {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      setCities(await staffRpc(rpc, args));
      setNotice(success); onReady();
      if (args.p_action === 'add_city') { setCityName(''); setFirstLocality(''); }
      if (args.p_action === 'add_locality') setLocality('');
      try { await refreshLocations(true); }
      catch { setNotice(`${success} Recarga la página para actualizar los selectores.`); }
      return true;
    } catch (err) { fail(err); return false; }
    finally { setBusy(false); }
  };
  const activeCount = cities.filter(city => city.active).length;
  const editCity = cities.find(city => city.id === editingCity);
  const edit = (action, zone, name) => save({ p_city_id: editCity.id, p_action: action, p_locality_id: zone?.id || null, p_name: name || null },
    action === 'remove_locality' ? 'Localidad retirada. Sus usuarios y publicaciones se conservan.' : action === 'restore_locality' ? 'Localidad recuperada.' : 'Nombre actualizado.', 'staff_location_edit');
  return <section className="staff-locations" aria-label="Administrar ciudades y localidades">
    <p className="staff-item-detail">Las ciudades activas aparecen en registro, perfiles, publicaciones y búsquedas. Añade localidades antes de activar una ciudad. Al desactivar se retira la ciudad de esos selectores; sus usuarios y publicaciones se conservan. Siempre debe quedar una ciudad activa.</p>
    {error && !editCity && <p role="alert" className="staff-location-error">{error}</p>}
    {notice && !editCity && <p role="status" className="staff-location-notice">{notice}</p>}
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
    {editCity && <section ref={editorRef} tabIndex={-1} className="staff-location-editor" aria-label={`Editar ${editCity.city}`}>
      <header className="staff-location-list-heading"><h2>Editar {editCity.city}</h2><button type="button" className="staff-button" onClick={() => { setEditingCity(''); setEditingZone(null); }} disabled={busy}><X size={15} />Cerrar edición</button></header>
      {error && <p role="alert" className="staff-location-error">{error}</p>}
      {notice && <p role="status" className="staff-location-notice">{notice}</p>}
      <p className="staff-item-detail">Quitar una localidad la retira de los selectores; puedes recuperarla después. Los nombres con publicaciones, usuarios, campañas o estadísticas se conservan para mantener el historial.</p>
      <form className="staff-location-inline-form" onSubmit={event => { event.preventDefault(); edit('rename_city', null, editName); }}>
        <div><label htmlFor="edit-city-name">Nombre de la ciudad</label><input id="edit-city-name" value={editName} minLength={2} maxLength={80} required disabled={busy || editCity.active} onChange={event => setEditName(event.target.value)} /></div>
        <button className="staff-button" disabled={busy || editCity.active || !editName.trim() || editName === editCity.city}><Save size={15} />Guardar nombre</button>
      </form>
      {editCity.active && <p className="staff-item-detail">Para corregir un nombre sin historial, primero desactiva la ciudad.</p>}
      <form className="staff-location-inline-form" onSubmit={async event => { event.preventDefault(); if (await save({ p_action: 'add_locality', p_city_id: editCity.id, p_name: newZone }, 'Localidad añadida.')) setNewZone(''); }}>
        <div><label htmlFor="edit-city-new-zone">Nueva localidad en {editCity.city}</label><input id="edit-city-new-zone" value={newZone} onChange={event => setNewZone(event.target.value)} minLength={2} maxLength={80} required disabled={busy} /></div>
        <button className="staff-button staff-button-primary" disabled={busy || !newZone.trim()}><Plus size={15} />Añadir localidad aquí</button>
      </form>
      <ul className="staff-location-edit-zones">{(editCity.locality_details || []).map(zone => <li key={zone.id} data-active={zone.active}>
        {editingZone?.id === zone.id ? <form className="staff-location-inline-form" onSubmit={async event => { event.preventDefault(); if (await edit('rename_locality', zone, editingZone.name)) setEditingZone(null); }}>
          <div><label htmlFor="edit-zone-name">Nombre de {zone.name}</label><input id="edit-zone-name" value={editingZone.name} minLength={2} maxLength={80} required onChange={event => setEditingZone({ ...editingZone, name: event.target.value })} disabled={busy} /></div>
          <button className="staff-button" disabled={busy || !editingZone.name.trim()}><Save size={15} />Guardar localidad</button>
          <button type="button" className="staff-button" onClick={() => setEditingZone(null)} disabled={busy}>Cancelar</button>
        </form> : <><span>{zone.name}{!zone.active && <small>Retirada</small>}</span><div className="staff-actions">
          <button type="button" className="staff-icon-button" aria-label={`Editar localidad ${zone.name}`} onClick={() => setEditingZone({ id: zone.id, name: zone.name })} disabled={busy}><Pencil size={15} /></button>
          <button type="button" className="staff-button" disabled={busy || (zone.active && editCity.active && editCity.localities.length <= 1)} title={zone.active && editCity.active && editCity.localities.length <= 1 ? 'Debe quedar una localidad disponible en una ciudad activa' : undefined} aria-label={`${zone.active ? 'Quitar' : 'Recuperar'} localidad ${zone.name}`} onClick={() => edit(zone.active ? 'remove_locality' : 'restore_locality', zone)}>{zone.active ? <X size={15} /> : <RotateCcw size={15} />}{zone.active ? 'Quitar' : 'Recuperar'}</button>
        </div></>}
      </li>)}</ul>
      {editCity.active && editCity.localities.length === 1 && <p className="staff-item-detail">La última localidad disponible se conserva mientras la ciudad esté activa.</p>}
    </section>}
    <div className="staff-location-list-heading"><h2>Ciudades configuradas</h2><button type="button" className="staff-button" onClick={load} disabled={busy}><RefreshCw size={15} />Actualizar</button></div>
    {busy && <p role="status">Cargando…</p>}
    <div className="staff-location-list">{cities.map(city => <article key={city.id}>
      <header><h3>{city.city}</h3><span className={`staff-badge ${city.active ? '' : 'staff-badge-muted'}`}>{city.active ? 'Activa' : 'Inactiva'}</span></header>
      <p className="staff-item-detail">{city.localities.length} localidades disponibles{city.locality_details?.some(zone => !zone.active) ? ` · ${city.locality_details.filter(zone => !zone.active).length} retiradas` : ''}</p>
      <ul>{city.localities.map(name => <li key={name}>{name}</li>)}</ul>
      <button type="button" className="staff-button" disabled={busy} onClick={() => { setEditingCity(city.id); setEditName(city.city); setNewZone(''); setEditingZone(null); setNotice(''); setError(''); }}><Pencil size={15} />Editar {city.city}</button>
      {city.active && <button type="button" className="staff-button" disabled={busy || activeCount <= 1} title={activeCount <= 1 ? 'Debe quedar al menos una ciudad activa' : undefined} onClick={() => save({ p_action: 'deactivate_city', p_city_id: city.id }, `${city.city} está desactivada. Se conservan sus usuarios y publicaciones.`)}><Pause size={16} />Desactivar {city.city}</button>}
      {!city.active && <button type="button" className="staff-button" disabled={busy || !city.localities.length} onClick={() => save({ p_action: 'activate_city', p_city_id: city.id }, `${city.city} ya está disponible para publicar.`)}><Check size={16} />Activar {city.city}</button>}
    </article>)}</div>
  </section>;
}
