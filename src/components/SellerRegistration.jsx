import {useEffect,useId,useRef,useState} from 'react';
import {supabase} from '../supabase/supabaseClient.js';
import {SELLER_NOTICE_VERSION,SELLER_REGISTRATION_PREVIEW} from '../supabase/sellerRegistration.js';

export function ProfileSellerRegistration({userId,disabled}){
  const [available,setAvailable]=useState(false);
  useEffect(()=>{
    if(!userId||disabled||SELLER_REGISTRATION_PREVIEW)return;
    let active=true;
    supabase.rpc('my_seller_registration_status').then(({data,error})=>{
      if(active)setAvailable(!error&&data?.enrollmentOpen===true);
    }).catch(()=>{if(active)setAvailable(false);});
    return ()=>{active=false;};
  },[userId,disabled]);
  if(disabled||!(available||SELLER_REGISTRATION_PREVIEW))return null;
  return <SellerRegistration userId={userId} showTransition={SELLER_REGISTRATION_PREVIEW}/>;
}

export default function SellerRegistration({userId,onSaved,onCancel,disabled=false,showTransition=true}){
  const embedded=Boolean(onSaved);
  const [open,setOpen]=useState(embedded),[record,setRecord]=useState(null);
  const [transition,setTransition]=useState(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false),[attempt,setAttempt]=useState(0);
  const titleId=useId(),locked=useRef(false);
  useEffect(()=>{
    if(embedded||!userId||!showTransition)return;
    let active=true;
    supabase.rpc('my_seller_transition_notice').then(({data,error})=>{
      if(active&&!error&&['upcoming','paused'].includes(data?.state)&&Number.isFinite(Date.parse(data.startsAt)))setTransition(data);
    }).catch(()=>{/* El formulario sigue disponible si no se puede cargar el aviso. */});
    return ()=>{active=false;};
  },[embedded,showTransition,userId]);
  useEffect(()=>{
    if(!open||!userId)return;
    let active=true;
    supabase.rpc('my_seller_registration').then(({data,error})=>{
      if(!active)return;
      if(error||!data)setError('No se pudo abrir el registro de vendedor.');
      else setRecord(data);
    }).catch(()=>{if(active)setError('No se pudo abrir el registro de vendedor.');});
    return ()=>{active=false;};
  },[open,userId,attempt]);

  const close=()=>{
    if(locked.current)return;
    setOpen(false);setRecord(null);setError('');onCancel?.();
  };
  const submit=async event=>{
    event.preventDefault();
    if(locked.current||disabled||!record)return;
    const values=new FormData(event.currentTarget);
    const value=key=>String(values.get(key)??'').trim();
    locked.current=true;setBusy(true);setError('');
    try{
      const {error}=await supabase.rpc('save_my_seller_registration',{
        p_legal_name:value('legalName'),p_document_type:value('documentType'),p_document_number:value('documentNumber'),
        p_notification_address:value('notificationAddress'),p_phone:value('phone'),p_consent:values.get('consent')==='on',
        p_consent_version:SELLER_NOTICE_VERSION,
      });
      if(error){setError(error.code==='22023'?'Revisa los datos y confirma el uso indicado.':'No se pudo guardar el registro. Vuelve a intentarlo.');return;}
      setRecord(null);setOpen(false);setSaved(true);setTransition(null);onSaved?.();
    }catch{setError('No se pudo guardar el registro. Vuelve a intentarlo.');}
    finally{locked.current=false;setBusy(false);}
  };

  return <section aria-labelledby={titleId} className="space-y-3 p-4 text-sm text-gray-700">
    <h3 id={titleId} className="font-bold text-gray-900">Registro de vendedor</h3>
    {transition&&<div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900" role="status">
      <p>{transition.state==='paused'
        ?'Tus ofertas no aparecen en el catálogo hasta que completes el registro. Las que sigan vigentes volverán a aparecer al actualizar el catálogo.'
        :<>Completa tu registro antes del <time dateTime={transition.startsAt}>{new Intl.DateTimeFormat('es-CO',{dateStyle:'long',timeStyle:'short',timeZone:'America/Bogota'}).format(new Date(transition.startsAt))}</time> (hora de Colombia) para mantener visibles tus ofertas.</>}</p>
      <p className="mt-1">Puedes terminar o cancelar las reservas en curso.</p>
    </div>}
    {!open?<>
      {saved&&<p role="status">Registro de vendedor guardado.</p>}
      <button type="button" className="font-semibold text-forest-green underline" disabled={disabled} onClick={()=>{setError('');setSaved(false);setOpen(true);}}>Completar o actualizar mis datos de vendedor</button>
    </>:<>
      <p>MiBatute guarda estos datos en su registro privado de vendedores, alojado en Estados Unidos. Puede facilitar tu identificación a quien acredite una compra para presentar un reclamo, o a la autoridad competente cuando la solicite. Puedes ejercer tus derechos en <a href="/datos-personales" className="underline" target="_blank" rel="noreferrer">Solicitudes de datos</a>.</p>
      {error&&<p role="alert" className="text-red-700">{error}</p>}
      {!record?<div className="flex gap-4">
        {error?<button type="button" className="underline" onClick={()=>{setError('');setAttempt(value=>value+1);}}>Reintentar</button>:<p role="status">Cargando tus datos…</p>}
        <button type="button" className="underline" onClick={close}>Volver</button>
      </div>:<form className="space-y-3" onSubmit={submit}>
        <fieldset disabled={busy||disabled} className="grid gap-3 [&_label]:grid [&_label]:gap-1 [&_input:not([type=checkbox])]:rounded-lg [&_input:not([type=checkbox])]:border [&_input:not([type=checkbox])]:p-2 [&_select]:rounded-lg [&_select]:border [&_select]:p-2">
          <label>Nombre completo o razón social<input name="legalName" minLength={3} maxLength={150} required defaultValue={record.legalName??''}/></label>
          <label>Tipo de identificación<select name="documentType" defaultValue={record.documentType??'CC'}>
            <option value="CC">Cédula de ciudadanía</option><option value="CE">Cédula de extranjería</option><option value="PAS">Pasaporte</option><option value="NIT">NIT</option><option value="OTRO">Otro documento</option>
          </select></label>
          <label>Número de identificación<input name="documentNumber" autoComplete="off" required maxLength={25} pattern="[A-Za-z0-9][A-Za-z0-9\-]{2,24}" defaultValue={record.documentNumber??''}/></label>
          <label>Dirección física de notificaciones (incluye ciudad)<input name="notificationAddress" minLength={8} maxLength={240} required defaultValue={record.notificationAddress??''}/></label>
          <label>Teléfono de contacto<input name="phone" type="tel" inputMode="numeric" autoComplete="tel-national" required pattern="[0-9]{10}" maxLength={10} defaultValue={record.phone??''}/></label>
          <label className="!flex items-start"><input name="consent" type="checkbox" required className="mt-1"/><span>Confirmo que los datos son correctos y autorizo su uso para el registro de vendedor y la atención de reclamos y requerimientos. Puedo actualizar mis datos desde Mi perfil y consultar la <a href="/privacidad" className="underline" target="_blank" rel="noreferrer">política de privacidad</a>.</span></label>
        </fieldset>
        <div className="flex flex-wrap gap-3">
          <button type="button" className="underline" disabled={busy} onClick={close}>Volver</button>
          <button className="rounded-xl bg-forest-green px-4 py-2 font-bold text-white disabled:opacity-50" type="submit" disabled={busy||disabled}>{busy?'Guardando…':embedded?'Guardar y continuar':'Guardar datos'}</button>
        </div>
      </form>}
    </>}
  </section>;
}
