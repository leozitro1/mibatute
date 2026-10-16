import { createSignalDeduplicator } from './marketSignals.js';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function staffInboxNotice(payload,accountCreatedAt,general=false) {
  if(!payload||!uuid.test(payload.id||'')||!Number.isFinite(Date.parse(payload.created_at)))return null;
  if(general&&(!Number.isFinite(Date.parse(accountCreatedAt))||!Number.isFinite(Date.parse(payload.audience_cutoff))
    ||Date.parse(accountCreatedAt)>Date.parse(payload.audience_cutoff)))return null;
  return {id:`inbox-staff-${payload.id}`,type:'system_notice',receipt_id:payload.id,receipt_kind:'staff',
    created_at:payload.created_at,title:'Mensaje de MiBatute',subtitle:'Tienes un mensaje en tu buzón.',read:false,unreadCount:1};
}

export function subscribeStaffInbox(client,user,onNotice,onAccountChange,{onMarketSignal,onReconnect,onStatus}={}) {
  if(!user?.id)return()=>{};
  let active=true;const channels=[];const accept=createSignalDeduplicator();
  Promise.resolve(client.realtime.setAuth()).then(()=>{
    if(!active)return;
    for(const [topic,general]of [[`mb:inbox:user:${user.id}`,false],['mb:inbox:all',true]]){
      const channel=client.channel(topic,{config:{private:true}}).on('broadcast',{event:'inbox_notice'},({payload})=>{
        if(!active)return;const notice=staffInboxNotice(payload,user.created_at,general);if(notice)onNotice(notice);
      });
      if(!general)channel.on('broadcast',{event:'market_signal'},({payload})=>{
        if(!active||!accept(payload))return;
        if(payload.kind==='account'&&payload.profile?.id===user.id)onAccountChange?.(payload.profile);
        else onMarketSignal?.(payload);
      });
      let joined=false;
      channels.push(channel);channel.subscribe(status=>{
        if(!active||general)return;
        onStatus?.(status);
        if(status==='SUBSCRIBED'){
          if(joined)onReconnect?.();
          joined=true;
        }
      });
    }
  }).catch(()=>{/* Existing activity refresh remains available if Realtime cannot connect. */});
  return()=>{active=false;for(const channel of channels)client.removeChannel(channel);};
}
