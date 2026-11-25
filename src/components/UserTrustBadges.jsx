import { createElement, useEffect, useId, useState } from 'react';
import { ShieldCheck, Shield, Store } from 'lucide-react';
import './UserTrustBadges.css';

export default function UserTrustBadges({verified=false,sellerRegistered=false,compact=false,identity=null}) {
 const [open,setOpen]=useState(null),id=useId();
 useEffect(()=>{
  if(open===null)return;
  const timer=window.setTimeout(()=>setOpen(null),3000);
  return()=>window.clearTimeout(timer);
 },[open]);
 const badges=[
  {key:'seller',active:sellerRegistered===true,label:sellerRegistered?'Vendedor registrado':'Sin registro de vendedor',description:sellerRegistered?'Completó sus datos de vendedor. Este registro no acredita su identidad ni garantiza sus transacciones.':'No tiene un registro de vendedor vigente.',Icon:Store},
  {key:'verified',active:verified===true,label:verified?'Cuenta verificada':'Cuenta sin verificar',description:verified?'Solicitud revisada y aprobada manualmente por MiBatute. No garantiza las transacciones.':'No tiene una verificación manual aprobada por MiBatute.',Icon:verified?ShieldCheck:Shield},
 ];
 return <div className={`user-trust-badges${compact?' is-compact':''}${identity?' has-identity':''}`} onClick={event=>event.stopPropagation()} onKeyDown={event=>{if(event.key==='Escape'){setOpen(null);event.stopPropagation();}}}>
  {identity&&<div className="user-trust-identity">{identity}</div>}
  {(identity?[badges[1],badges[0]]:badges).map(({key,active,label,description,Icon})=><span key={key} className={`user-trust-badge user-trust-badge--${key}${active?' is-active':' is-missing'}`}>
   <button type="button" title={label} aria-label={label} aria-expanded={open===key} aria-controls={open===key?`${id}-${key}`:undefined} onClick={()=>setOpen(current=>current===key?null:key)}>
    {createElement(Icon,{size:compact||identity&&key==='verified'?17:14,'aria-hidden':true})}{!compact&&!(identity&&key==='verified')&&label}
   </button>
   {open===key&&<span id={`${id}-${key}`} role="status" className="user-trust-explanation">{description}</span>}
  </span>)}
 </div>;
}
