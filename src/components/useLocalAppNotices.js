import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { listenMarketSignals } from './marketSignals.js';
import { createForegroundNoticeGate, createIconBadgeWriter, iconBadgeSupport, localNoticeCount, localNoticeMetadata, requestIconBadgePermission } from './localAppNotices.js';
import { readNoticePreferences, subscribeNoticePreferences, writeNoticePreferences } from './localNoticePreferences.js';

export default function useLocalAppNotices({uid,active,items,activeChatId}) {
  const snapshot = useCallback(() => {
    let storage;
    try {storage=window.localStorage;} catch { /* Private browsing can block storage. */ }
    const value = readNoticePreferences(storage,uid);
    return `${value.badge?'1':'0'}${value.banners?'1':'0'}`;
  },[uid]);
  const preferences = useSyncExternalStore(subscribeNoticePreferences,snapshot,()=>'01');
  const badge = preferences[0] === '1', banners = preferences[1] === '1';
  const [banner,setBanner] = useState(null), [request,setRequest] = useState(null);
  const [writeBadge] = useState(() => createIconBadgeWriter(window.navigator));
  const managedBadge = useRef(false);
  const gate = useMemo(() => createForegroundNoticeGate(Date.now,uid),[uid]);
  const count = localNoticeCount(items);
  const latest = useRef(null);
  latest.current = {uid,active,badge,banners,count,activeChatId,gate};
  const updatePreferences = patch => {
    const current = latest.current;
    let storage;try {storage=window.localStorage;} catch { /* Session-only fallback. */ }
    writeNoticePreferences(storage,current.uid,{badge:current.badge,banners:current.banners,...patch});
    if (patch.banners === false) setBanner(null);
  };
  useEffect(() => {
    if (active && uid) {managedBadge.current=true;writeBadge(badge ? count : 0);}
    else if (managedBadge.current) {managedBadge.current=false;writeBadge(0);}
  },[active,uid,badge,count,writeBadge]);
  useEffect(() => () => {if (managedBadge.current) writeBadge(0);},[writeBadge]);
  useEffect(() => {
    const visibility = () => {
      if (document.visibilityState !== 'visible') setBanner(null);
      else {
        const current = latest.current;
        if (current.active && current.uid) writeBadge(current.badge ? current.count : 0);
      }
    };
    document.addEventListener('visibilitychange',visibility);
    return () => document.removeEventListener('visibilitychange',visibility);
  },[writeBadge]);
  useEffect(() => listenMarketSignals(signal => {
    const current = latest.current;
    if (!current.active || !current.uid || current.uid !== uid || signal.uid !== current.uid || !signal.foregroundNotice) return;
    const notice = gate(signal.foregroundNotice,{visible:current.banners && document.visibilityState === 'visible',activeChatId:current.activeChatId,uid:signal.uid,messagePreview:signal.message_preview});
    if (notice) setBanner({...notice,uid:current.uid,gate});
  }),[gate,uid]);
  useEffect(() => {
    if (!banner) return;
    const timer = setTimeout(() => setBanner(null),8000);
    return () => clearTimeout(timer);
  },[banner]);
  const enableBadge = async () => {
    const owner = latest.current.uid;
    if (!owner || !latest.current.active) return;
    setRequest({uid:owner,gate,busy:true,error:''});
    try {
      // The permission call happens synchronously from this explicit button tap.
      const granted = await requestIconBadgePermission();
      if (latest.current.uid !== owner || latest.current.gate !== gate || !latest.current.active) return;
      if (!granted) throw new Error('No se activó el contador. Revisa el permiso de notificaciones en los ajustes del teléfono.');
      updatePreferences({badge:true});setRequest({uid:owner,gate,busy:false,error:''});
    } catch (error) {
      if (latest.current.uid === owner && latest.current.gate === gate) setRequest({uid:owner,gate,busy:false,error:error.message || 'No se pudo activar el contador.'});
    }
  };
  return {badge,banners,count,support:iconBadgeSupport(),updatePreferences,enableBadge,
    request:request?.uid === uid && request.gate === gate ? request : null,
    banner:active && banners && banner?.uid === uid && banner.gate === gate && (!banner.chatId || banner.chatId !== activeChatId)
      && (banner.preview || items.some(item => localNoticeMetadata(item)?.group === banner.group)) ? banner : null,
    previewBanner:() => {if (latest.current.uid && latest.current.active && latest.current.banners) setBanner({uid:latest.current.uid,gate,kind:'message',group:'preview',at:Date.now(),preview:true,context:'Artículo de ejemplo',body:'Hola, ¿podemos coordinar la entrega para mañana?'});},
    dismissBanner:() => setBanner(null)};
}
