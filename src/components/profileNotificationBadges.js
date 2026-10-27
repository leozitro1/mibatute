import { activityDestination,CONVERSATION_NOTIFICATION_TYPES } from './activityNotifications.js';
import { mergeNotificationHistory,NOTIFICATION_STATE_LIMIT } from './notificationHistory.js';

const receiptKey=item=>`${item.receipt_kind||'system'}:${item.receipt_id}`;

export function profileNotificationBadges(items,userId,ownedArticles=[]) {
  const counts={publicaciones:0,rescates:0,buzon:0};
  if(!userId)return counts;
  const owned=new Set(ownedArticles.map(article=>String(article.id||article.articulo_id)));
  const notifications=mergeNotificationHistory([],items,NOTIFICATION_STATE_LIMIT),receipts=new Set();
  const accepted=new Set(notifications.filter(item=>item.type==='donation_accepted').map(item=>String(item.articulo_id)));
  for(const item of notifications){
    if(item.read||item.bellRead||!item.unreadCount)continue;
    if(item.type==='ganador'&&accepted.has(String(item.articulo_id)))continue;
    let tab;
    if(item.type==='system_notice'){
      const key=item.receipt_id?receiptKey(item):String(item.id);
      if(receipts.has(key))continue;receipts.add(key);tab='buzon';
    }else if(owned.has(String(item.articulo_id))||['postulacion','venta'].includes(item.type))tab='publicaciones';
    else if(item.type==='ganador'||String(item.buyer_id)===String(userId))tab='rescates';
    else if(item.buyer_id)tab='publicaciones';
    else {tab=activityDestination(item.type);if(tab==='chat')tab='rescates';}
    counts[tab]+=item.unreadCount;
  }
  return counts;
}


export function profileInboxBadges(items,userId) {
 const notices=profileNotificationBadges(items.filter(item=>item.type==='system_notice'),userId).buzon;
 const support=profileNotificationBadges(items.filter(item=>item.type==='system_notice'&&item.receipt_kind==='support'),userId).buzon;
 const chats=profileNotificationBadges(items.filter(item=>CONVERSATION_NOTIFICATION_TYPES.has(item.type)||item.type==='ganador'),userId);
 return {system:Math.max(0,notices-support),conversations:support,users:chats.publicaciones+chats.rescates};
}

export function mergeInboxNotifications(previous,messages) {
  const bellReads=new Set((previous||[]).filter(item=>item.type==='system_notice'&&item.bellRead).map(receiptKey));
  const receipts=(messages||[]).filter(message=>message.receipt_id).map(message=>({
    id:`inbox-${message.receipt_kind||'system'}-${message.receipt_id}`,type:'system_notice',
    receipt_id:message.receipt_id,receipt_kind:message.receipt_kind||'system',created_at:message.created_at,
    title:String(message.title||'Mensaje de MiBatute').slice(0,512),
    read:!!message.read_at,unreadCount:message.read_at?0:1,
    ...(bellReads.has(receiptKey(message))?{bellRead:true}:{}),
  }));
  const keys=new Set(receipts.map(receiptKey));
  // The inbox snapshot is authoritative, including an intentional mark-as-unread.
  return mergeNotificationHistory([],[(previous||[]).filter(item=>item.type!=='system_notice'||!keys.has(receiptKey(item))),receipts].flat(),NOTIFICATION_STATE_LIMIT);
}

export function updateInboxNotification(items,receiptId,action,kind='system',throughAt=null) {
  if(!['read','unread','delete'].includes(action))return items;
  const current=mergeNotificationHistory([],items,NOTIFICATION_STATE_LIMIT);
  if(action==='delete'&&kind==='support')return current.filter(item=>!(item.receipt_kind==='support'&&String(item.receipt_id)===String(receiptId)));
  return current.map(item=>
    item.type==='system_notice'&&String(item.receipt_id)===String(receiptId)&&(item.receipt_kind||'system')===kind
      &&(!throughAt||Date.parse(item.created_at)<=Date.parse(throughAt))
      ?{...item,read:action!=='unread',unreadCount:action==='unread'?1:0}:item);
}

// Support replies disappear from a refreshed feed after the owner hides a thread.
// Preserve arrivals newer than the HTTP request, including concurrent realtime replies.
export function mergeActivitySnapshot(previous,incoming,startedAt) {
  const visible=new Set(incoming.filter(item=>item.receipt_kind==='support').map(item=>String(item.receipt_id)));
  return mergeNotificationHistory(previous.filter(item=>item.receipt_kind!=='support'||visible.has(String(item.receipt_id))
    ||Date.parse(item.created_at)>startedAt),incoming,NOTIFICATION_STATE_LIMIT);
}
