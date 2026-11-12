import {useEffect,useId,useRef,useState} from 'react';
import {sharedArticleId} from '../components/articleShare.js';

const fields={name:'Nombre o razón social',document:'Identificación',address:'Dirección de notificaciones',phone:'Teléfono'};
const articleIdPattern=/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;

function articleId(value){
  if(articleIdPattern.test(value))return value;
  try{return sharedArticleId(value);}catch{return null;}
}

export default function StaffSellerClaim({thread,rpc,onReverify}){
  const [open,setOpen]=useState(false),[data,setData]=useState(null),[busy,setBusy]=useState(false);
  const [error,setError]=useState(''),[needsMfa,setNeedsMfa]=useState(false);
  const lookupState=useRef({version:0,pending:false}),heading=useId();
  const requestMessage=thread.messages?.filter(message=>message.author_role==='user').at(-1);

  useEffect(()=>{
    const state=lookupState.current;
    const hide=()=>{if(document.hidden){state.version++;state.pending=false;setData(null);setOpen(false);setBusy(false);}};
    document.addEventListener('visibilitychange',hide);
    return()=>{state.version++;document.removeEventListener('visibilitychange',hide);};
  },[]);
  useEffect(()=>{
    if(!data)return;
    const expiry=setTimeout(()=>setData(null),45_000);
    return()=>clearTimeout(expiry);
  },[data]);

  async function lookup(event){
    event.preventDefault();const state=lookupState.current;if(state.pending)return;
    const form=new FormData(event.currentTarget);
    const id=articleId(String(form.get('article')??'').trim());
    const categories=form.getAll('category');
    if(!id||!requestMessage||!categories.length||form.get('verified')!=='on'){
      setError('Indica la publicación, selecciona los datos necesarios y confirma la verificación.');return;
    }
    const current=++state.version;state.pending=true;setBusy(true);setError('');setNeedsMfa(false);setData(null);
    try{
      const result=await rpc('staff_seller_claim_lookup',{p_thread:thread.id,p_article:id,
        p_evidence_seq:requestMessage.seq,p_categories:categories,p_verified:true});
      if(current===state.version&&!document.hidden)setData(result);
    }catch(err){
      if(current!==state.version)return;
      if(err?.code==='42501'){
        setError('Verifica nuevamente el segundo factor para consultar.');setNeedsMfa(true);
      }else if(err?.code==='P0001')setError('No se encontró un registro aplicable a este reclamo o la consulta está desactivada.');
      else setError('No se pudo consultar el registro. Revisa los datos e intenta nuevamente.');
    }finally{if(current===state.version){state.pending=false;setBusy(false);}}
  }

  if(!requestMessage)return null;
  return <section aria-labelledby={heading} className="rounded-xl border border-gray-200 p-3">
    <h4 id={heading} className="mb-2 font-semibold">Consulta interna por reclamo</h4>
    {!open?<button type="button" className="support-button" onClick={()=>{setError('');setNeedsMfa(false);setOpen(true);}}>Preparar consulta del vendedor</button>:<>
      <p className="support-hint">Verifica la identidad y la compra acordada entre las partes. La consulta muestra el registro actual del vendedor. Usa un canal privado autorizado para facilitar los datos.</p>
      <form className="support-compose" onSubmit={lookup}>
        <label>Enlace o ID de la publicación<input name="article" required maxLength={320} autoComplete="off" disabled={busy}/></label>
        <fieldset className="space-y-1" disabled={busy}><legend>Datos necesarios para este caso</legend>
          {Object.entries(fields).map(([key,label])=><label key={key} className="flex items-center gap-2"><input type="checkbox" name="category" value={key}/>{label}</label>)}
          <label className="flex items-start gap-2"><input type="checkbox" name="verified" required className="mt-1"/>Confirmo que comprobé la identidad del solicitante y la evidencia de compra para este reclamo.</label>
        </fieldset>
        {error&&<p role="alert" className="support-error">{error}</p>}
        <div className="support-actions">
          {needsMfa&&onReverify?<button type="button" className="support-button" onClick={onReverify}>Volver a verificar acceso</button>:<button type="submit" className="support-button" disabled={busy}>{busy?'Consultando…':'Consultar y registrar acceso'}</button>}
          <button type="button" className="support-button" disabled={busy} onClick={()=>{setData(null);setOpen(false);}}>Cerrar consulta</button>
        </div>
      </form>
      {data&&<section className="mt-3 space-y-2" aria-label="Datos privados del vendedor">
        <p className="support-hint" role="status">Consulta registrada. Los datos se ocultarán en 45 segundos.</p>
        <dl className="break-words text-sm">
          {data.legalName&&<><dt>{fields.name}</dt><dd>{data.legalName}</dd></>}
          {data.documentNumber&&<><dt>{fields.document}</dt><dd>{data.documentType} {data.documentNumber}</dd></>}
          {data.notificationAddress&&<><dt>{fields.address}</dt><dd>{data.notificationAddress}</dd></>}
          {data.phone&&<><dt>{fields.phone}</dt><dd>{data.phone}</dd></>}
        </dl>
        <button type="button" className="support-button" onClick={()=>setData(null)}>Ocultar datos</button>
      </section>}
    </>}
  </section>;
}
