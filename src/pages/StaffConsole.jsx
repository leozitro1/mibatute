import StyledSelect from "../components/StyledSelect.jsx";
import { createElement, lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, Inbox, Package, Flag, Users, Megaphone, History, Menu, X, LogOut,
  ArrowLeft, ArrowRight, Search, RefreshCw, Check, Pause, Play, Clock, Ban, Settings2, UserPlus, Pencil, LockKeyhole, CreditCard, Loader2, Trash2, MessageSquare, Star, Eye, Coins, Mail, Send, ChartNoAxesCombined, MapPin } from 'lucide-react';
import { staffClient, staffRpc, allowedSections } from '../staff/staffClient.js';
import { passwordError, recoveryCredentials, staffEmail } from '../staff/passwords.js';
import { ARTICLE_CATEGORIES, DELETION_REASONS, EMPTY_ARTICLE_FILTERS } from '../staff/moderation.js';
import useLocations from "../data/useLocations.js";
import StaffChatAudit from '../staff/StaffChatAudit.jsx';
import StaffReportDetail from '../staff/StaffReportDetail.jsx';
import StaffArticleEditor from '../staff/StaffArticleEditor.jsx';
import StaffUserDetail from '../staff/StaffUserDetail.jsx';
import StaffMessageComposer from '../staff/StaffMessageComposer.jsx';
import { AUDIT_GROUPS,EMPTY_AUDIT_FILTERS,auditMemberLabel } from '../staff/audit.js';
import './StaffConsole.css';
import useStaffAttention from '../staff/useStaffAttention.js';
import StaffAttention, { AttentionBadge, AttentionDot } from '../staff/StaffAttention.jsx';
import { attentionCounts, attentionRow } from '../staff/attention.js';

const ProductDetail=lazy(()=>import('../components/ProductDetail.jsx'));
const StaffSponsors=lazy(()=>import('../staff/StaffSponsors.jsx'));
const StaffEmailSettings=lazy(()=>import('../staff/StaffEmailSettings.jsx'));
const StaffLocations=lazy(()=>import('../staff/StaffLocations.jsx'));
const StaffStatistics=lazy(()=>import('../staff/StaffStatistics.jsx'));
const DataRightsInbox=lazy(()=>import('../components/DataRightsInbox.jsx'));
const SupportInbox=lazy(()=>import('../components/SupportInbox.jsx'));

const icons={inbox:Inbox,package:Package,flag:Flag,users:Users,megaphone:Megaphone,history:History,shield:ShieldCheck,chart:ChartNoAxesCombined,map:MapPin,settings:Settings2};
const permissions={moderation:'Moderación',reports:'Reportes',users:'Usuarios',chat_audit:'Auditar chats'};
const labels={disponible:'Disponible',reservado:'Reservado',entregado:'Entregado',pausado:'Pausado',en_revision:'En revisión',open:'Nuevo',reviewing:'En revisión',resolved:'Resuelto',dismissed:'Descartado',approved:'Aprobado',pending:'Pendiente'};
const date=value=>value?new Date(value).toLocaleString('es-CO',{dateStyle:'short',timeStyle:'short',timeZone:'America/Bogota'}):'';
const titleFor=(section,row)=>section==='articles'?row.title:section==='reports'?row.reason:section==='sponsors'?row.texto:section==='audit'?(row.action==='user.block'?'Usuario bloqueado permanentemente':row.action_label||'Acción administrativa'):row.nombre||row.email||'Cuenta';

function IconButton({label,icon,onClick,disabled,danger=false}) {
  return <button type="button" className={`staff-icon-button ${danger?'staff-danger':''}`} aria-label={label} title={label} onClick={onClick} disabled={disabled}>{createElement(icon,{size:17})}</button>;
}

export default function StaffConsole({ requireMaster=false }) {
  const { COLOMBIA_DATA } = useLocations();
  const [stage,setStage]=useState('loading');
  const [account,setAccount]=useState(null);
  const [login,setLogin]=useState('');
  const [password,setPassword]=useState('');
  const [newPassword,setNewPassword]=useState('');
  const [confirmation,setConfirmation]=useState('');
  const [recovery]=useState(()=>recoveryCredentials(window.location.hash)
    ||(new URLSearchParams(window.location.search).get('recovery')==='1'?{error:true}:null));
  const credentialMode=useRef(recovery?'recovery':null);
  const [code,setCode]=useState('');
  const [factor,setFactor]=useState(null);
  const [enrollment,setEnrollment]=useState(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [section,setSection]=useState('pending');
  const [search,setSearch]=useState('');
  const [query,setQuery]=useState('');
  const [page,setPage]=useState(1);
  const [data,setData]=useState(null);
  const [menu,setMenu]=useState(false);
  const [modal,setModal]=useState(null);
  const [reason,setReason]=useState('');
  const [days,setDays]=useState('1');
  const [creditAmount,setCreditAmount]=useState('1');
  const [selectedPermissions,setSelectedPermissions]=useState([]);
  const [teamEmail,setTeamEmail]=useState('');
  const [teamRole,setTeamRole]=useState('admin');
  const [sponsorRevision,setSponsorRevision]=useState(0);
  const [notice,setNotice]=useState('');
  const [articleFilters,setArticleFilters]=useState(EMPTY_ARTICLE_FILTERS);
  const [ownerName,setOwnerName]=useState('');
  const [deletionReason,setDeletionReason]=useState('');
  const [preview,setPreview]=useState(null);
  const [chatAudit,setChatAudit]=useState(null);
  const [reportDetail,setReportDetail]=useState(null);
  const [articleEditor,setArticleEditor]=useState(null);
  const [userDetail,setUserDetail]=useState(null);
  const [userFilters,setUserFilters]=useState({city:'',locality:'',state:'',reported:''});
  const [auditFilters,setAuditFilters]=useState(EMPTY_AUDIT_FILTERS);
  const [auditMembers,setAuditMembers]=useState([]);
  const [selectedUsers,setSelectedUsers]=useState([]),[messageComposer,setMessageComposer]=useState(null);
  const previewId=useRef(0);
  const previewRef=useRef(null);
  const [idleDeadline,setIdleDeadline]=useState(Date.now()+15*60000);
  const requestId=useRef(0);
  const hydration=useRef(null);
  const modalRef=useRef(null);
  const gateInFlight=useRef(false);
  const activeStage=useRef(stage); activeStage.current=stage;
  const nav=allowedSections(account);
  const articleActionsBusy=busy||search.trim()!==query;
  const canMessageUsers=account?.role==='master'||account?.permissions?.includes('users');
  const canAuditChats=account?.role==='master'||account?.permissions?.includes('chat_audit');
  const markStaffActivity=useCallback(()=>setIdleDeadline(Date.now()+15*60000),[]);

  const leave=useCallback(async(message='')=>{
    requestId.current++;previewId.current++;setPreview(null);setChatAudit(null);setReportDetail(null);setArticleEditor(null);setUserDetail(null);setSelectedUsers([]);setMessageComposer(null);
    credentialMode.current=null;
    setStage('login');setAccount(null);setData(null);setAuditMembers([]);setAuditFilters(EMPTY_AUDIT_FILTERS);setModal(null);setEnrollment(null);setFactor(null);setPassword('');setNewPassword('');setConfirmation('');setCode('');setError(message);
    try {await staffRpc('staff_close_session');} catch {
      // Local sign-out must still complete if the server session already expired.
    }
    await staffClient.auth.signOut({scope:'local'});
  },[]);

  const attention = useStaffAttention({ client: staffClient, enabled: stage === 'app', userId: account?.userId,
    onAccessExpired: () => leave('La sesión venció. Vuelve a verificar tu acceso.') });
  const counts = attention.counts ? attentionCounts(attention.counts, nav.map(item => item.id)) : null;

  const prepareGate=useCallback(async(forceMfa=false)=>{
    const access=await staffRpc('staff_bootstrap');
    if(requireMaster&&access.role!=='master') throw new Error('Acceso no autorizado.');
    setAccount(access);
    if(access.ready&&!forceMfa&&!credentialMode.current) {setSection('pending');setPage(1);setData(null);setStage('app');return;}
    const {data:factors,error:factorError}=await staffClient.auth.mfa.listFactors();
    if(factorError) throw factorError;
    const verified=factors.totp.find(item=>item.status==='verified');
    setFactor(verified?.id||null);setEnrollment(null);setCode('');setStage(verified?'verify':credentialMode.current==='recovery'?'reset':'enroll');
  },[requireMaster]);

  useEffect(()=>{
    const meta=document.createElement('meta');meta.name='robots';meta.content='noindex, nofollow, noarchive';document.head.append(meta);
    return ()=>meta.remove();
  },[]);
  useEffect(()=>{
    let active=true;
    staffClient.auth.startAutoRefresh();
    if(!hydration.current) {
      if(recovery)window.history.replaceState(null,'',window.location.pathname);
      hydration.current=recovery?(recovery.error?Promise.reject(new Error('Enlace inválido.')):staffClient.auth.setSession(recovery)):staffClient.auth.getSession();
    }
    hydration.current.then(async({data:sessionData})=>{
      if(!active)return;
      if(!sessionData?.session) {if(recovery)await leave('El enlace no es válido o venció. Solicita uno nuevo.');else setStage('login');return;}
      try {await prepareGate();} catch {await leave('Acceso no autorizado.');}
    }).catch(()=>{if(active)leave('El enlace no es válido o venció. Solicita uno nuevo.');});
    const {data:subscription}=staffClient.auth.onAuthStateChange(event=>{
      if(event==='SIGNED_OUT') {setStage('login');setAccount(null);setData(null);}
    });
    return ()=>{active=false;subscription.subscription.unsubscribe();staffClient.auth.stopAutoRefresh();};
  },[prepareGate,leave,recovery]);
  useEffect(()=>{
    if(stage!=='app')return;
    const deadline=Math.min(idleDeadline,Date.parse(account.expiresAt));
    const timer=setTimeout(()=>leave('La sesión venció. Ingresa de nuevo.'),Math.max(0,deadline-Date.now()));
    const check=()=>{if(Date.now()>=deadline)leave('La sesión venció. Ingresa de nuevo.');};
    document.addEventListener('visibilitychange',check);
    return ()=>{clearTimeout(timer);document.removeEventListener('visibilitychange',check);};
  },[stage,account,idleDeadline,leave]);
  useEffect(()=>{const timer=setTimeout(()=>{setQuery(search.trim());setPage(1);},350);return()=>clearTimeout(timer);},[search]);
  useEffect(()=>{if(modal&&modalRef.current&&!modalRef.current.open)modalRef.current.showModal();},[modal]);
  useEffect(()=>{if(preview&&previewRef.current&&!previewRef.current.open)previewRef.current.showModal();},[preview]);

  const load=useCallback(async()=>{
    if(activeStage.current!=='app')return;
    if(['pending','sponsors','statistics','inbox','privacy','locations','settings'].includes(section)){requestId.current++;setBusy(false);return;}
    const id=++requestId.current;
    setBusy(true);setError('');
    try {
      const result=section==='audit'
        ?await staffRpc('staff_audit_entries',{p_search:query,p_page:page,p_group:auditFilters.group,p_days:auditFilters.days,p_actor:auditFilters.actor})
        :await staffRpc('staff_queue',{p_section:section,p_search:query,p_page:page,p_filters:section==='articles'?articleFilters:section==='users'?userFilters:{}});
      if(id===requestId.current&&activeStage.current==='app') {setData(result);if(section==='audit')setAuditMembers(result.members||[]);setIdleDeadline(Date.now()+15*60000);}
    } catch(err) {
      if(id!==requestId.current)return;
      if(err.code==='42501') {setData(null);setModal(null);setError('Verifica nuevamente tu segundo factor.');try{await prepareGate(true);}catch{await leave('Acceso no autorizado.');}}
      else setError(err.message);
    } finally {if(id===requestId.current)setBusy(false);}
  },[section,query,page,articleFilters,userFilters,auditFilters,prepareGate,leave]);
  const sectionRevision = attention.revisions[section] || 0;
  useEffect(()=>{if(stage==='app')load();},[stage,load,sectionRevision]);

  const submitLogin=async event=>{
    event.preventDefault();if(gateInFlight.current)return;
    gateInFlight.current=true;setBusy(true);setError('');
    try {
      const email=staffEmail(login,requireMaster);
      const result=await staffClient.auth.signInWithPassword({email,password});
      setPassword('');if(result.error)throw result.error;
      await prepareGate(credentialMode.current==='change');
    } catch {await leave('No se pudo ingresar. Comprueba tus credenciales y permisos.');}
    finally {gateInFlight.current=false;setBusy(false);}
  };
  const enroll=async()=>{
    if(gateInFlight.current)return;gateInFlight.current=true;setBusy(true);setError('');
    try {
      const {data:factors}=await staffClient.auth.mfa.listFactors();
      for(const item of factors?.totp||[])if(item.status==='unverified')await staffClient.auth.mfa.unenroll({factorId:item.id});
      const {data:result,error:enrollError}=await staffClient.auth.mfa.enroll({factorType:'totp',friendlyName:'MiBatute equipo',issuer:'MiBatute'});
      if(enrollError)throw enrollError;setFactor(result.id);setEnrollment(result.totp);setStage('verify');
    } catch(err) {setError(err.message||'No se pudo configurar el segundo factor.');}
    finally {gateInFlight.current=false;setBusy(false);}
  };
  const verify=async event=>{
    event.preventDefault();if(gateInFlight.current||!/^[0-9]{6}$/.test(code))return;
    gateInFlight.current=true;setBusy(true);setError('');
    try {
      const {error:verifyError}=await staffClient.auth.mfa.challengeAndVerify({factorId:factor,code});
      if(verifyError)throw verifyError;
      if(credentialMode.current) {setCode('');setStage('reset');return;}
      const access=await staffRpc('staff_open_session');
      setAccount(access);setEnrollment(null);setCode('');setSection('pending');setPage(1);setData(null);setStage('app');setIdleDeadline(Date.now()+15*60000);
    } catch {setCode('');setError('Código no válido o vencido. Intenta de nuevo.');}
    finally {gateInFlight.current=false;setBusy(false);}
  };
  const requestRecovery=async event=>{
    event.preventDefault();if(gateInFlight.current)return;
    gateInFlight.current=true;setBusy(true);setError('');setNotice('');
    try {
      const {error:recoveryError}=await staffClient.auth.resetPasswordForEmail(staffEmail(login,requireMaster),{
        redirectTo:`${window.location.origin}${window.location.pathname}?recovery=1`,
      });
      if(recoveryError)throw recoveryError;
      setNotice('Si la cuenta existe, recibirás un enlace en su correo.');
    } catch {setError('No se pudo enviar el enlace. Espera un momento e intenta de nuevo.');}
    finally {gateInFlight.current=false;setBusy(false);}
  };
  const openPasswordChange=async()=>{
    const {data:sessionData}=await staffClient.auth.getSession();
    if(!sessionData.session)return leave('La sesión venció.');
    requestId.current++;credentialMode.current='change';setLogin(sessionData.session.user.email);
    setPassword('');setNewPassword('');setConfirmation('');setData(null);setModal(null);setMenu(false);setNotice('');setError('');setStage('confirm');
  };
  const savePassword=async event=>{
    event.preventDefault();if(gateInFlight.current)return;
    const validation= passwordError(newPassword,confirmation);
    if(validation){setError(validation);return;}
    gateInFlight.current=true;setBusy(true);setError('');
    try {
      const {error:updateError}=await staffClient.auth.updateUser({password:newPassword});
      if(updateError)throw updateError;
      const {error:logoutError}=await staffClient.auth.signOut({scope:'global'});
      await leave();
      setNotice(logoutError?'Contraseña actualizada. No se pudo cerrar todas las sesiones; vuelve a ingresar.':'Contraseña actualizada. Las sesiones se cerraron; ingresa con tu nueva contraseña y autenticador.');
    } catch(err) {setError(err.code==='same_password'?'Elige una contraseña distinta de la actual.':'No se pudo actualizar. Verifica tu acceso nuevamente o solicita otro enlace.');}
    finally {gateInFlight.current=false;setBusy(false);}
  };
  const navigate=id=>{setSection(id);setPage(1);setSearch('');setQuery('');setData(null);setError('');setNotice('');setMenu(false);setSelectedUsers([]);};
  const openAction=(row,action,label)=>{setModal({row,action,label,...(action==='compensate'?{requestId:crypto.randomUUID()}:{})});setReason('');setDeletionReason('');setDays('1');setCreditAmount('1');setSelectedPermissions(row.permissions||[]);setError('');};
  const filterArticles=(key,value)=>{setArticleFilters(previous=>({...previous,[key]:value,...(key==='city'?{locality:''}:{})}));setPage(1);setData(null);};
  const filterUsers=(key,value)=>{setUserFilters(previous=>({...previous,[key]:value,...(key==='city'?{locality:''}:{})}));setPage(1);setData(null);setSelectedUsers([]);};
  const toggleUser=row=>{
    if(selectedUsers.some(user=>user.id===row.id))setSelectedUsers(previous=>previous.filter(user=>user.id!==row.id));
    else if(selectedUsers.length>=100)setError('Selecciona hasta 100 usuarios por envío.');
    else setSelectedUsers(previous=>[...previous,{id:row.id,nombre:row.nombre}]);
  };
  const pageUsers=data?.rows||[],pageSelected=pageUsers.length>0&&pageUsers.every(row=>selectedUsers.some(user=>user.id===row.id));
  const togglePageUsers=()=>{
    if(pageSelected)setSelectedUsers(previous=>previous.filter(user=>!pageUsers.some(row=>row.id===user.id)));
    else {
      const added=pageUsers.filter(row=>!selectedUsers.some(user=>user.id===row.id)).map(row=>({id:row.id,nombre:row.nombre}));
      if(selectedUsers.length+added.length>100)setError('Selecciona hasta 100 usuarios por envío.');
      else setSelectedUsers(previous=>[...previous,...added]);
    }
  };
  const filterAudit=(key,value)=>{setAuditFilters(previous=>({...previous,[key]:value}));setPage(1);setData(null);};
  const openArticle=async row=>{
    const id=++previewId.current;setPreview({loading:true,title:row.title});setError('');
    try {
      const article=await staffRpc('staff_article_preview',{p_id:row.id});
      if(id===previewId.current&&activeStage.current==='app'){setPreview(article);setIdleDeadline(Date.now()+15*60000);}
    } catch(err) {if(id===previewId.current)setPreview({title:row.title,error:err.message});}
  };
  const submitAction=async event=>{
    event.preventDefault();if(gateInFlight.current)return;
    gateInFlight.current=true;setBusy(true);setError('');
    try {
      let result;
      if(modal.action==='add')await staffRpc('staff_add_account',{p_email:teamEmail,p_role:teamRole,p_reason:reason});
      else if(modal.action==='block')result=await staffRpc('staff_block_user',{p_user:modal.row.id,p_reason:reason});
      else if(modal.action==='compensate')result=await staffRpc('staff_compensate_credits',{p_user:modal.row.id,p_amount:Number(creditAmount),p_reason:reason,p_request_id:modal.requestId});
      else {
        const kind=section==='articles'?'article':section==='reports'?(modal.row.kind==='chat'?'chat_report':'report'):section==='users'?'user':section==='sponsors'?'sponsor':'staff';
        result=await staffRpc('staff_action',{p_kind:kind,p_id:modal.row.id,p_action:modal.action,p_reason:reason,
          p_options:modal.action==='permissions'?{permissions:selectedPermissions}:modal.action==='delete'?{reason_code:deletionReason}:{days:Number(days)}});
      }
      setModal(null);setNotice(result?.notice||'Cambio guardado en el historial.');setIdleDeadline(Date.now()+15*60000);attention.refresh();await load();
    } catch(err) {
      if(err.code==='42501'){setModal(null);try{await prepareGate(true);}catch{await leave('Acceso no autorizado.');}}
      else setError(err.message);
    } finally {gateInFlight.current=false;setBusy(false);}
  };

  if(stage==='loading')return <div className="staff-console staff-auth"><Loader2 className="animate-spin" aria-label="Cargando" /></div>;
  if(stage!=='app')return <main className="staff-console staff-auth">
    <section className="staff-auth-form">
      <div className="staff-brand">MiBatute</div><div className="staff-role">Acceso del equipo</div>
      <ShieldCheck size={28} className="mt-6 text-forest-green" aria-hidden="true" />
      <h1>{stage==='login'?'Iniciar sesión':stage==='forgot'?'Recuperar contraseña':stage==='confirm'?'Confirmar identidad':stage==='reset'?'Nueva contraseña':stage==='enroll'?'Configurar segundo factor':'Verificar acceso'}</h1>
      {error&&<p role="alert" className="staff-error">{error}</p>}
      {notice&&<p role="status" className="mt-4 text-sm text-forest-green">{notice}</p>}
      {stage==='forgot'?<form onSubmit={requestRecovery}>
        <label htmlFor="staff-recovery-email">Correo o usuario</label><input id="staff-recovery-email" autoComplete="username" value={login} onChange={event=>setLogin(event.target.value)} required disabled={busy} />
        <button type="submit" className="staff-button staff-button-primary" disabled={busy||!!notice}><LockKeyhole size={17} />Enviar enlace</button>
      </form>:stage==='reset'?<form onSubmit={savePassword}>
        <label htmlFor="staff-new-password">Nueva contraseña</label><input id="staff-new-password" type="password" autoComplete="new-password" minLength={12} maxLength={128} value={newPassword} onChange={event=>setNewPassword(event.target.value)} required disabled={busy} />
        <label htmlFor="staff-confirm-password">Confirmar contraseña</label><input id="staff-confirm-password" type="password" autoComplete="new-password" minLength={12} maxLength={128} value={confirmation} onChange={event=>setConfirmation(event.target.value)} required disabled={busy} />
        <button type="submit" className="staff-button staff-button-primary" disabled={busy}><Check size={17} />Guardar contraseña</button>
      </form>:stage==='login'||stage==='confirm'?<form onSubmit={submitLogin}>
        <label htmlFor="staff-login">Correo o usuario</label><input id="staff-login" autoComplete="username" value={login} onChange={event=>setLogin(event.target.value)} required disabled={busy} />
        <label htmlFor="staff-password">{stage==='confirm'?'Contraseña actual':'Contraseña'}</label><input id="staff-password" type="password" autoComplete="current-password" value={password} onChange={event=>setPassword(event.target.value)} required disabled={busy} />
        <button type="submit" className="staff-button staff-button-primary" disabled={busy}>{busy?<Loader2 size={17} className="animate-spin" />:<LockKeyhole size={17} />} {stage==='confirm'?'Continuar':'Ingresar'}</button>
        {stage==='login'&&<button type="button" className="text-sm text-forest-green mt-4" onClick={()=>{setError('');setNotice('');setStage('forgot');}} disabled={busy}>Olvidé mi contraseña</button>}
      </form>:stage==='enroll'?<button type="button" className="staff-button staff-button-primary mt-6 w-full" onClick={enroll} disabled={busy}>Configurar autenticador</button>:<form onSubmit={verify}>
        {enrollment&&<>
          <img className="staff-qr" src={enrollment.qr_code.startsWith('data:')?enrollment.qr_code:`data:image/svg+xml;charset=utf-8,${encodeURIComponent(enrollment.qr_code)}`} alt="Código QR del autenticador" />
          <details><summary className="text-sm cursor-pointer">Clave de configuración manual</summary><p className="staff-auth-secret mt-2">{enrollment.secret}</p></details>
        </>}
        <label htmlFor="staff-code">Código del autenticador</label><input id="staff-code" className="staff-auth-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={event=>setCode(event.target.value.replace(/\D/g,''))} required disabled={busy} />
        <button type="submit" className="staff-button staff-button-primary" disabled={busy||code.length!==6}>{busy?<Loader2 size={17} className="animate-spin" />:<Check size={17} />} Verificar</button>
      </form>}
      <div className="mt-6 flex justify-between items-center gap-3 text-sm text-gray-500"><Link to="/">Volver a MiBatute</Link>{stage!=='login'&&<button type="button" onClick={()=>{setNotice('');leave();}} disabled={busy}>{stage==='forgot'?'Volver al ingreso':'Salir'}</button>}</div>
    </section>
  </main>;

  const current=nav.find(item=>item.id===section);
  return <div className="staff-console staff-shell">
    {menu&&<button className="fixed inset-0 z-50 bg-black/40 md:hidden" type="button" aria-label="Cerrar menú" onClick={()=>setMenu(false)} />}
    <aside className="staff-sidebar" data-open={menu} aria-label="Navegación del equipo">
      <div className="flex items-center justify-between"><div className="staff-brand">MiBatute</div><button className="site-icon-close inline-flex items-center justify-center md:hidden" type="button" aria-label="Cerrar menú" onClick={()=>setMenu(false)}><X size={20} /></button></div>
      <div className="staff-role">{account.role==='master'?'Super Admin':'Admin'}</div>
      <nav className="staff-nav">{nav.map(item=>{const Icon=icons[item.icon];return <button key={item.id} type="button" aria-current={section===item.id?'page':undefined} onClick={()=>navigate(item.id)}><Icon size={18} aria-hidden="true" /><span className="staff-nav-label">{item.label}</span><AttentionBadge count={item.id==='team'?0:counts?.[item.id]} /></button>;})}</nav>
      <div className="staff-sidebar-bottom"><button type="button" onClick={openPasswordChange} disabled={busy}><LockKeyhole size={17} />Cambiar contraseña</button><Link to="/"><ArrowLeft size={17} />Ver MiBatute</Link><button type="button" onClick={()=>leave()}><LogOut size={17} />Cerrar sesión</button></div>
    </aside>
    <div className="staff-main">
      <header className="staff-header"><div className="flex items-center gap-3"><button type="button" className="staff-icon-button staff-menu-toggle" aria-label="Abrir menú" onClick={()=>setMenu(true)}><Menu size={20} /></button><strong>Espacio de gestión</strong></div><div className="staff-header-actions"><StaffAttention counts={counts} status={attention.status} onNavigate={navigate} onRefresh={attention.refresh} /><small className="flex items-center gap-2"><ShieldCheck size={15} /> MFA verificado</small></div></header>
      <main className="staff-content">
        <div className="staff-heading"><div><h1>{current?.label}</h1>{section==='articles'&&<p className="staff-results-count" role="status">{articleActionsBusy||!data?'Calculando publicaciones…':`${new Intl.NumberFormat('es-CO').format(data.total)} ${data.total===1?'publicación':'publicaciones'}`}</p>}</div><div className="staff-tools">
          {!['pending','statistics','privacy','locations','settings'].includes(section)&&<label className="staff-search"><Search size={16} /><input aria-label="Buscar en el panel" placeholder={section==='users'?'Nombre, correo, teléfono o ID':'Buscar'} value={search} onChange={event=>{setSearch(event.target.value);setSelectedUsers([]);}} /></label>}
          {section==='team'&&<button type="button" className="staff-button staff-button-primary" onClick={()=>{setModal({action:'add',label:'Incorporar cuenta verificada'});setTeamEmail('');setTeamRole('admin');setReason('');setError('');}}><UserPlus size={16} />Incorporar</button>}
          {!['statistics','privacy','locations','settings'].includes(section)&&<IconButton label="Actualizar" icon={RefreshCw} onClick={()=>{attention.refresh();if(['sponsors','inbox'].includes(section))setSponsorRevision(previous=>previous+1);else load();}} disabled={busy} />}
        </div></div>
        {section==='articles'&&<div className="staff-filters" aria-label="Filtros de publicaciones">
          <div><label htmlFor="staff-filter-mode">Tipo de publicación</label><select id="staff-filter-mode" value={articleFilters.mode} onChange={event=>filterArticles('mode',event.target.value)}><option value="">Todos los tipos</option><option value="venta">Venta</option><option value="donacion">Donación</option></select></div>
          <div><label htmlFor="staff-filter-city">Ciudad</label><StyledSelect id="staff-filter-city" value={articleFilters.city} onChange={event=>filterArticles('city',event.target.value)}><option value="">Todas las ciudades</option>{COLOMBIA_DATA.map(item=><option key={item.city}>{item.city}</option>)}</StyledSelect></div>
          <div><label htmlFor="staff-filter-locality">Localidad</label><select id="staff-filter-locality" value={articleFilters.locality} onChange={event=>filterArticles('locality',event.target.value)} disabled={!articleFilters.city}><option value="">Todas las localidades</option>{(COLOMBIA_DATA.find(item=>item.city===articleFilters.city)?.localities||[]).map(item=><option key={item}>{item}</option>)}</select></div>
          <div><label htmlFor="staff-filter-category">Categoría</label><select id="staff-filter-category" value={articleFilters.category} onChange={event=>filterArticles('category',event.target.value)}><option value="">Todas las categorías</option>{ARTICLE_CATEGORIES.map(item=><option key={item}>{item}</option>)}</select></div>
          <div><label htmlFor="staff-filter-status">Estado</label><select id="staff-filter-status" value={articleFilters.status} onChange={event=>filterArticles('status',event.target.value)}><option value="">Todos los estados</option>{['disponible','en_revision','pausado','reservado','entregado'].map(item=><option key={item} value={item}>{labels[item]}</option>)}</select></div>
          <div><label htmlFor="staff-filter-chat">Chat de negociación</label><select id="staff-filter-chat" value={articleFilters.chat} onChange={event=>filterArticles('chat',event.target.value)}><option value="">Todas las publicaciones</option><option value="active">Con chat abierto o pendiente</option><option value="any">Con historial de chat</option><option value="none">Sin chat</option></select></div>
          <div><label htmlFor="staff-filter-featured">Destacados</label><select id="staff-filter-featured" value={articleFilters.featured} onChange={event=>filterArticles('featured',event.target.value)}><option value="">Todas las publicaciones</option><option value="yes">Solo destacadas</option><option value="no">Sin destacar</option></select></div>
          <button type="button" className="staff-button" onClick={()=>{setArticleFilters(EMPTY_ARTICLE_FILTERS);setOwnerName('');setPage(1);setSearch('');setQuery('');setData(null);}}>Limpiar filtros</button>
        </div>}
        {section==='articles'&&articleFilters.owner_id&&<div className="staff-owner-filter"><span>Publicaciones de <strong>{ownerName||'Usuario'}</strong></span><button type="button" className="staff-button" onClick={()=>{filterArticles('owner_id','');setOwnerName('');}}>Ver todas</button></div>}
        {section==='users'&&<div className="staff-filters" aria-label="Filtros de usuarios">
          <div><label htmlFor="staff-user-city">Ciudad</label><StyledSelect id="staff-user-city" value={userFilters.city} onChange={event=>filterUsers('city',event.target.value)}><option value="">Todas las ciudades</option>{COLOMBIA_DATA.map(item=><option key={item.city}>{item.city}</option>)}</StyledSelect></div>
          <div><label htmlFor="staff-user-locality">Barrio / localidad</label><select id="staff-user-locality" value={userFilters.locality} onChange={event=>filterUsers('locality',event.target.value)} disabled={!userFilters.city}><option value="">Todos los barrios / localidades</option>{(COLOMBIA_DATA.find(item=>item.city===userFilters.city)?.localities||[]).map(item=><option key={item}>{item}</option>)}</select></div>
          <div><label htmlFor="staff-user-state">Estado de cuenta</label><select id="staff-user-state" value={userFilters.state} onChange={event=>filterUsers('state',event.target.value)}><option value="">Todos los estados</option><option value="active">Activos</option><option value="suspended">Suspendidos</option><option value="blocked">Bloqueados</option></select></div>
          <div><label htmlFor="staff-user-reported">Publicaciones con reportes</label><select id="staff-user-reported" value={userFilters.reported} onChange={event=>filterUsers('reported',event.target.value)}><option value="">Todos los usuarios</option><option value="yes">Con publicaciones reportadas</option></select></div>
          <button type="button" className="staff-button" onClick={()=>{setUserFilters({city:'',locality:'',state:'',reported:''});setPage(1);setSearch('');setQuery('');setData(null);setSelectedUsers([]);}}>Limpiar filtros</button>
          <span className="staff-results-count" role="status">{articleActionsBusy||!data?'Calculando usuarios…':`${data.total} ${data.total===1?'usuario':'usuarios'}`}</span>
        </div>}
        {section==='users'&&<div className="staff-message-toolbar"><span>{selectedUsers.length} seleccionados</span><button type="button" className="staff-button" disabled={!selectedUsers.length||articleActionsBusy} onClick={()=>setMessageComposer({all:false,recipients:selectedUsers})}><Send size={16} />Mensaje a seleccionados</button><button type="button" className="staff-button" disabled={articleActionsBusy} onClick={()=>setMessageComposer({all:true,recipients:[]})}><Megaphone size={16} />Comunicado a todos</button>{selectedUsers.length>0&&<button type="button" className="site-icon-close inline-flex items-center justify-center staff-icon-button" title="Limpiar selección" aria-label="Limpiar selección" onClick={()=>setSelectedUsers([])}><X size={16} /></button>}</div>}
        {section==='audit'&&<div className="staff-filters" aria-label="Filtros de auditoría">
          <div><label htmlFor="staff-audit-group">Tipo de actividad</label><select id="staff-audit-group" value={auditFilters.group} onChange={event=>filterAudit('group',event.target.value)}><option value="">Todas las actividades</option>{Object.entries(AUDIT_GROUPS).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></div>
          <div><label htmlFor="staff-audit-period">Período</label><select id="staff-audit-period" value={auditFilters.days} onChange={event=>filterAudit('days',Number(event.target.value))}><option value={0}>Todo el historial</option><option value={1}>Hoy</option><option value={7}>Últimos 7 días</option><option value={30}>Últimos 30 días</option><option value={90}>Últimos 90 días</option></select></div>
          {account.role==='master'&&<div><label htmlFor="staff-audit-actor">Responsable</label><select id="staff-audit-actor" value={auditFilters.actor} onChange={event=>filterAudit('actor',event.target.value)}><option value="">Todos los responsables</option><option value="me">Mis acciones</option><option value="system">Sistema</option><optgroup label="Integrantes del equipo">{auditMembers.map(member=><option key={member.id} value={member.id}>{auditMemberLabel(member)}</option>)}</optgroup></select></div>}
          <button type="button" className="staff-button" onClick={()=>{setAuditFilters(EMPTY_AUDIT_FILTERS);setPage(1);setSearch('');setQuery('');setData(null);}}>Limpiar filtros</button>
          <span className="staff-results-count" role="status">{articleActionsBusy||!data?'Calculando acciones…':`${data.total} ${data.total===1?'acción registrada':'acciones registradas'}`}</span>
        </div>}
        {error&&<p role="alert" className="staff-error">{error}</p>}
        {notice&&<p role="status" className="mb-4 text-sm text-forest-green">{notice}</p>}
        {busy&&!modal&&<p role="status" className="mb-4 flex items-center gap-2 text-sm text-gray-500"><Loader2 size={16} className="animate-spin" /> Cargando...</p>}
        {section==='pending'?<>
          <div className="staff-metrics">
            {account.role==='master'||account.permissions.includes('moderation')?<button type="button" onClick={()=>navigate('articles')}><span>Publicaciones por revisar {counts?.articles>0&&<AttentionDot />}</span><strong>{counts?.articles??'—'}</strong></button>:null}
            {account.role==='master'||account.permissions.includes('reports')?<button type="button" onClick={()=>navigate('reports')}><span>Reportes abiertos {counts?.reports>0&&<AttentionDot />}</span><strong>{counts?.reports??'—'}</strong></button>:null}
            <button type="button" onClick={()=>navigate('privacy')}><span>Solicitudes de datos {counts?.privacy>0&&<AttentionDot />}</span><strong>{counts?.privacy??'—'}</strong></button>
            <button type="button" onClick={()=>navigate('inbox')}><span>Conversaciones sin leer {counts?.inbox>0&&<AttentionDot label="Conversaciones sin leer" />}</span><strong>{counts?.inbox??'—'}</strong></button>
            {account.role==='master'?<button type="button" onClick={()=>navigate('team')}><span>Cuentas del equipo</span><strong>{counts?.team??'—'}</strong></button>:null}
          </div>
          <div className="staff-status-band"><ShieldCheck size={20} className="text-forest-green" /><span>Verificación en dos pasos activa</span></div>
          <div className="staff-status-band"><History size={20} className="text-teal-700" /><span>Historial de acciones</span><button type="button" className="ml-auto staff-button" onClick={()=>navigate('audit')}>Consultar</button></div>
          {account.role==='master'&&<div className="staff-status-band"><CreditCard size={20} className="text-amber-700" /><span>Pagos y ajustes de créditos</span><span className="ml-auto staff-badge staff-badge-muted">Desactivados</span></div>}
        </>:section==='settings'&&account.role==='master'?<Suspense fallback={<p role="status">Cargando configuración…</p>}><StaffEmailSettings onReady={markStaffActivity} onAccessExpired={leave} /></Suspense>:section==='locations'&&account.role==='master'?<Suspense fallback={<p role="status">Cargando ubicaciones…</p>}><StaffLocations onReady={markStaffActivity} onAccessExpired={leave} /></Suspense>:section==='privacy'?<Suspense fallback={<p role="status">Cargando solicitudes…</p>}><DataRightsInbox client={staffClient} isStaff userId={account.userId} revision={attention.revisions.privacy||0} onActivity={markStaffActivity} onAccessExpired={()=>leave('Verifica nuevamente tu acceso.')} /></Suspense>:section==='inbox'?<Suspense fallback={<p role="status">Cargando buzón…</p>}><SupportInbox key={account.userId} client={staffClient} isStaff userId={account.userId} query={query} revision={sponsorRevision+(attention.revisions.inbox||0)} managedRealtime onActivity={markStaffActivity} onAccessExpired={()=>leave('La sesión venció. Vuelve a verificar tu acceso.')} /></Suspense>:section==='sponsors'?<Suspense fallback={<p role="status">Cargando campañas...</p>}><StaffSponsors query={query} revision={sponsorRevision} onReady={markStaffActivity} onAccessExpired={leave} /></Suspense>:section==='statistics'?<Suspense fallback={<p role="status">Cargando estadísticas...</p>}><StaffStatistics revision={sponsorRevision} onReady={markStaffActivity} onAccessExpired={leave} /></Suspense>:<>
          <table className={`staff-table ${section==='articles'?'staff-publications-table':section==='users'?'staff-users-table':''}`}><thead><tr>{section==='users'&&<th className="staff-user-selection"><input type="checkbox" aria-label="Seleccionar usuarios de esta página" checked={pageSelected} ref={node=>{if(node)node.indeterminate=!pageSelected&&pageUsers.some(row=>selectedUsers.some(user=>user.id===row.id));}} disabled={articleActionsBusy||!pageUsers.length} onChange={togglePageUsers} /></th>}<th>{section==='audit'?'Acción':section==='reports'?'Caso':'Registro'}</th>{section==='users'&&<><th>Publicaciones</th><th>Calificación</th><th>Créditos</th></>}<th>{section==='audit'?'Tipo':'Estado'}</th><th>Fecha</th><th>{section==='audit'?'Responsable':'Acciones'}</th></tr></thead>
            <tbody>{(data?.rows||[]).map(row=><tr key={row.id}>{section==='users'&&<td className="staff-user-selection"><input type="checkbox" aria-label={`Seleccionar usuario: ${row.nombre||'Usuario'}`} checked={selectedUsers.some(user=>user.id===row.id)} disabled={articleActionsBusy} onChange={()=>toggleUser(row)} /></td>}
              <td className={attentionRow(section,row)?'staff-attention-cell':undefined}>{attentionRow(section,row)&&<AttentionDot label={section==='reports'?'Reporte sin resolver':'Publicación por revisar'} />}{section==='articles'?<><button type="button" className="staff-item staff-article-link" onClick={()=>openArticle(row)} aria-label={`Abrir publicación: ${row.title}`}>
                {row.image_url&&<img src={row.image_url} alt="" loading="lazy" />}<span><span className="staff-article-title"><span className="staff-item-title">{row.title}</span>{row.is_featured&&<span className="staff-featured-star" role="img" aria-label="Publicación destacada" title="Publicación destacada"><Star size={16} aria-hidden="true" /></span>}</span><span className="staff-item-detail">{row.mode==='venta'?'Venta':'Donación'} · {row.city} · {row.locality}</span>{Number(row.chat_count)>0&&<span className="staff-chat-indicator" title={`${row.active_chat_count} abiertos o pendientes`}><MessageSquare size={14} aria-hidden="true" />{row.chat_count} {Number(row.chat_count)===1?'chat':'chats'}</span>}</span>
              </button><button type="button" className="staff-owner-link" aria-label={`Ver publicaciones de ${row.owner_name||'Usuario'}`} onClick={()=>{setOwnerName(row.owner_name||'Usuario');filterArticles('owner_id',row.owner_id);}} disabled={!row.owner_id}>Publicado por: <strong>{row.owner_name||'Usuario'}</strong></button></>:section==='reports'?<button type="button" className="staff-article-link" aria-label={`Abrir reporte: ${row.reason}`} onClick={()=>setReportDetail(row)}><span className="staff-item-title">{row.kind==='chat'?'Chat':'Publicación'} · {row.article_title||'Publicación no disponible'}</span><span className="staff-item-detail">{row.reason}</span><span className="staff-item-detail">Reportado: {row.reported_name||'Usuario'}</span></button>:section==='users'?<button type="button" className="staff-item staff-article-link" aria-label={`Ver usuario: ${row.nombre||'Usuario'}`} onClick={()=>setUserDetail(row)}>{row.foto_url&&<img src={row.foto_url} alt="" loading="lazy" />}<span><span className="staff-item-title">{row.nombre||'Usuario'}</span><span className="staff-item-detail">{[row.ciudad,row.localidad].filter(Boolean).join(' · ')||'Sin ubicación'}</span></span></button>:<div className="staff-item"><div><span className="staff-item-title">{titleFor(section,row)}</span><span className="staff-item-detail">{section==='team'?row.email:section==='audit'?row.reason:section==='sponsors'?row.descripcion:''}</span></div></div>}</td>
              {section==='users'&&<><td data-label="Publicaciones"><strong>{row.stats?.created??0} creadas</strong><span className="staff-item-detail">{row.stats?.active??0} activas</span><span className="staff-item-detail">{row.stats?.featured??0} destacadas · {row.stats?.reported??0} con reportes</span></td><td data-label="Calificación"><strong>{row.stats?.rating==null?'Sin calificar':`${Number(row.stats.rating).toFixed(1)} / 5`}</strong><span className="staff-item-detail">{row.stats?.rating_count??0} calificaciones</span></td></>}
              {section==='users'&&<td data-label="Créditos"><span className="staff-credit-balance"><Coins size={15} aria-hidden="true" /><strong>{row.credits??0}</strong></span></td>}
              <td data-label={section==='audit'?'Tipo':'Estado'}><span className={`staff-badge ${row.status==='open'?'staff-badge-warning':''}`}>{section==='team'?(row.active?(row.role==='master'?'Super Admin':'Admin'):'Desactivado'):section==='users'?(row.is_blocked?'Bloqueado':Date.parse(row.ban_until)>Date.now()?'Suspendido':'Activo'):section==='sponsors'?(row.activo?'Activo':'Pausado'):section==='audit'?(AUDIT_GROUPS[row.action_group]||'Otras acciones'):labels[row.status]||row.status}</span></td>
              <td data-label="Fecha">{date(row.created_at)}</td>
              <td>{section==='audit'?<span className="text-xs text-gray-500" title={row.actor_id||''}>{row.actor_name||'Sistema'}{row.actor_email&&<span className="staff-item-detail staff-audit-email">{row.actor_email}</span>}</span>:<div className={`staff-actions ${section==='articles'?'staff-publication-actions':section==='reports'?'staff-report-actions':section==='users'?'staff-user-actions':''}`}>
                {section==='articles'&&<IconButton label="Ver publicación" icon={Eye} disabled={articleActionsBusy} onClick={()=>openArticle(row)} />}
                {section==='articles'&&<IconButton label="Editar publicación" icon={Pencil} disabled={articleActionsBusy||['reservado','entregado'].includes(row.status)} onClick={()=>setArticleEditor(row)} />}
                {section==='articles'&&canAuditChats&&<button type="button" className="staff-button" aria-label="Auditar chats de publicación" title={Number(row.chat_count)>0?'Consultar historial de chats':'Esta publicación no tiene conversaciones'} disabled={articleActionsBusy||!(Number(row.chat_count)>0)} onClick={()=>setChatAudit(row)}><MessageSquare size={17} aria-hidden="true" />Chats</button>}
                {section==='articles'&&<><IconButton label="Aprobar publicación" icon={Check} disabled={articleActionsBusy||['reservado','entregado'].includes(row.status)} onClick={()=>openAction(row,'approve','Aprobar publicación')} /><IconButton label={['en_revision','pausado'].includes(row.status)?'Reactivar publicación':'Pausar publicación'} icon={['en_revision','pausado'].includes(row.status)?Play:Pause} disabled={articleActionsBusy||['reservado','entregado'].includes(row.status)} onClick={()=>openAction(row,['en_revision','pausado'].includes(row.status)?'approve':'pause',['en_revision','pausado'].includes(row.status)?'Reactivar publicación':'Pausar publicación')} /><IconButton label="Eliminar publicación" icon={Trash2} danger disabled={articleActionsBusy||['reservado','entregado'].includes(row.status)} onClick={()=>openAction(row,'delete','Eliminar publicación')} /></>}
                {section==='reports'&&<><button type="button" className="staff-icon-button staff-report-review" aria-label="En revisión" title="En revisión" disabled={busy||row.status==='reviewing'} onClick={()=>openAction(row,'reviewing','Poner en revisión')}><Clock size={16} aria-hidden="true" /></button><button type="button" className="staff-icon-button staff-report-approve" aria-label="Aprobado" title="Aprobado" disabled={busy} onClick={()=>openAction(row,'approved','Aprobar publicación reportada')}><Check size={16} aria-hidden="true" /></button><button type="button" className="staff-icon-button staff-danger" aria-label="Eliminar" title="Eliminar publicación" disabled={busy} onClick={()=>openAction(row,'delete','Eliminar publicación reportada')}><Trash2 size={16} aria-hidden="true" /></button></>}
                {section==='users'&&<><IconButton label="Enviar mensaje" icon={Mail} disabled={articleActionsBusy} onClick={()=>setMessageComposer({all:false,recipients:[{id:row.id,nombre:row.nombre}]})} /><IconButton label="Agregar créditos" icon={Coins} disabled={articleActionsBusy||row.id===account.userId} onClick={()=>openAction(row,'compensate','Agregar créditos por compensación')} /><IconButton label="Suspender usuario" icon={Clock} disabled={busy||row.is_blocked} onClick={()=>openAction(row,'suspend','Suspender usuario')} />{account.role==='master'&&<IconButton label="Bloquear permanentemente" icon={Ban} danger disabled={busy||row.is_blocked||row.id===account.userId} onClick={()=>openAction(row,'block','Bloquear usuario permanentemente')} />}<IconButton label="Restablecer usuario" icon={Play} disabled={busy||(row.is_blocked&&account.role!=='master')} onClick={()=>openAction(row,'restore','Restablecer usuario')} /></>}
                {section==='team'&&<><IconButton label={row.active?'Desactivar cuenta':'Activar cuenta'} icon={row.active?Pause:Play} disabled={busy||row.id===account.userId} onClick={()=>openAction(row,row.active?'disable':'enable',row.active?'Desactivar cuenta':'Activar cuenta')} />{row.role==='admin'&&<IconButton label="Editar permisos" icon={Settings2} disabled={busy||row.id===account.userId} onClick={()=>openAction(row,'permissions','Editar permisos')} />}</>}
              </div>}</td>
            </tr>)}</tbody>
          </table>
          {!busy&&!data?.rows?.length&&<p className="staff-empty">No hay registros que coincidan.</p>}
          {data?.pageCount>1&&<nav className="staff-pagination" aria-label="Paginación del panel"><IconButton label="Página anterior" icon={ArrowLeft} onClick={()=>setPage(data.page-1)} disabled={busy||data.page<=1} /><span>{data.page} de {data.pageCount}</span><IconButton label="Página siguiente" icon={ArrowRight} onClick={()=>setPage(data.page+1)} disabled={busy||data.page>=data.pageCount} /></nav>}
        </>}
      </main>
    </div>
    {messageComposer&&<StaffMessageComposer recipients={messageComposer.recipients} all={messageComposer.all} initialTitle={messageComposer.articleContext?`Sobre tu publicación: ${messageComposer.articleContext.title}`.slice(0,120):''} initialBody={messageComposer.articleContext?`Hola, te contactamos sobre tu publicación «${messageComposer.articleContext.title}».\n\n`:''} onReady={markStaffActivity} onClose={()=>setMessageComposer(null)} onSent={result=>{setMessageComposer(null);setSelectedUsers([]);setNotice(`${result.notice} ${result.count} ${result.count===1?'destinatario':'destinatarios'}.`);}} />}
    {articleEditor&&<StaffArticleEditor key={articleEditor.id} article={articleEditor} onReady={markStaffActivity} onClose={()=>setArticleEditor(null)} onSaved={result=>{setArticleEditor(null);setNotice(result.notice);load();}} />}
    {userDetail&&<StaffUserDetail key={userDetail.id} user={userDetail} onMessage={canMessageUsers?recipient=>{setUserDetail(null);setMessageComposer({all:false,recipients:[recipient],articleContext:userDetail.articleContext});}:undefined} onReady={markStaffActivity} onClose={()=>setUserDetail(null)} onAccessExpired={leave} onOpenArticle={account?.role==='master'||account?.permissions?.includes('moderation')?row=>{setUserDetail(null);openArticle(row);}:undefined} />}
    {reportDetail&&<StaffReportDetail key={`${reportDetail.kind}-${reportDetail.id}`} report={reportDetail} onClose={()=>setReportDetail(null)} onOpenArticle={row=>{setReportDetail(null);openArticle(row);}} />}
    {chatAudit&&<StaffChatAudit article={chatAudit} onClose={()=>setChatAudit(null)} onAccessExpired={async()=>{setChatAudit(null);try{await prepareGate(true);}catch{await leave('Acceso no autorizado.');}}} />}
    {preview&&<dialog ref={previewRef} className={preview.loading||preview.error?'staff-modal staff-preview':'staff-public-detail'} aria-label="Detalle de publicación" onCancel={()=>{previewId.current++;setPreview(null);}}>
      {preview.loading||preview.error?<><div className="staff-modal-heading"><h2>{preview.title}</h2><IconButton label="Cerrar publicación" icon={X} onClick={()=>{previewId.current++;setPreview(null);}} /></div>{preview.loading?<p role="status">Cargando publicación...</p>:<p role="alert" className="staff-error">{preview.error}</p>}</>:<div className="mb-design-preview"><Suspense fallback={<p role="status">Cargando detalle…</p>}><ProductDetail key={preview.id} item={preview} isOpen staffPreview onOpenOwner={canMessageUsers?owner=>{previewId.current++;setPreview(null);setUserDetail({...owner,articleContext:{id:preview.id,title:preview.title}});}:undefined} onClose={()=>{previewId.current++;setPreview(null);}} /></Suspense></div>}
    </dialog>}
    {modal&&<dialog ref={modalRef} aria-labelledby="staff-modal-title" className="staff-modal" onCancel={event=>{event.preventDefault();if(!busy)setModal(null);}}><form onSubmit={submitAction}>
      <div className="staff-modal-heading"><h2 id="staff-modal-title">{modal.label}</h2><IconButton label="Cerrar confirmación" icon={X} onClick={()=>setModal(null)} disabled={busy} /></div>
      {modal.row&&<p className="text-sm text-gray-600">{titleFor(section,modal.row)}</p>}
      {modal.action==='add'&&<><label htmlFor="staff-team-email">Correo confirmado de la cuenta</label><input id="staff-team-email" type="email" value={teamEmail} onChange={event=>setTeamEmail(event.target.value)} required /><label htmlFor="staff-team-role">Rol</label><select id="staff-team-role" value={teamRole} onChange={event=>setTeamRole(event.target.value)}><option value="admin">Admin</option><option value="master">Super Admin</option></select></>}
      {modal.action==='suspend'&&<><label htmlFor="staff-days">Días de suspensión</label><select id="staff-days" value={days} onChange={event=>setDays(event.target.value)}>{[1,3,7,15,30].map(value=><option key={value} value={value}>{value}</option>)}</select></>}
      {modal.action==='block'&&<p className="staff-error">Este bloqueo es permanente y no vence automáticamente. El usuario no podrá publicar, solicitar artículos ni enviar mensajes. Recibirá el motivo y la opción de solicitar una revisión en su buzón. Solo un super admin podrá restablecer su cuenta.</p>}
      {modal.action==='compensate'&&<><p className="staff-item-detail">Saldo actual: {modal.row.credits??0} créditos</p><label htmlFor="staff-credit-amount">Créditos a agregar</label><input id="staff-credit-amount" type="number" min="1" max="5" step="1" required value={creditAmount} onChange={event=>setCreditAmount(event.target.value)} disabled={busy} /></>}
      {modal.action==='permissions'&&Object.entries(permissions).map(([value,label])=><label className="staff-permission" key={value}><input type="checkbox" checked={selectedPermissions.includes(value)} onChange={event=>setSelectedPermissions(previous=>event.target.checked?[...previous,value]:previous.filter(item=>item!==value))} />{label}</label>)}
      {modal.action==='delete'&&<><p className="staff-error">La publicación se eliminará. El propietario recibirá el motivo y el detalle en su buzón.</p><label htmlFor="staff-delete-reason">Razón de eliminación</label><select id="staff-delete-reason" value={deletionReason} onChange={event=>setDeletionReason(event.target.value)} required><option value="">Selecciona una razón</option>{DELETION_REASONS.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></>}
      <label htmlFor="staff-reason">{modal.action==='delete'?'Detalle para el propietario':'Motivo'}</label><textarea id="staff-reason" value={reason} onChange={event=>setReason(event.target.value)} minLength={8} maxLength={500} required disabled={busy} />
      {error&&<p role="alert" className="staff-error">{error}</p>}
      <button type="submit" className={`staff-button ${['delete','block'].includes(modal.action)?'staff-delete-button':'staff-button-primary'} w-full`} disabled={busy||reason.trim().length<8||(modal.action==='delete'&&!deletionReason)||(modal.action==='compensate'&&(!Number.isInteger(Number(creditAmount))||Number(creditAmount)<1||Number(creditAmount)>5))}>{busy?<Loader2 size={17} className="animate-spin" />:modal.action==='block'?<Ban size={17} />:modal.action==='delete'?<Trash2 size={17} />:<Check size={17} />}{modal.action==='block'?'Bloquear permanentemente y notificar':modal.action==='delete'?'Eliminar y notificar':modal.action==='compensate'?'Agregar y notificar':'Confirmar'}</button>
    </form></dialog>}
  </div>;
}
