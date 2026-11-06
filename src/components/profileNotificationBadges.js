import { mergeNotificationHistory,NOTIFICATION_STATE_LIMIT } from './notificationHistory.js';

const receiptKey=item=>`${item.receipt_kind||'system'}:${item.receipt_id}`;
// Informational activity belongs to bell history, not to pending-work counters.
const PROFILE_PENDING_TYPES = new Set(['chat', 'postulacion', 'venta', 'system_notice']);

// A bounded successful snapshot only settles missing sources inside its coverage.
// Keep bell history and concurrent arrivals; a failed or partial read is not proof of deletion.
export function settleMissingNotifications(previous, incoming, { type, field, ids = null, startedAt, oldest = 0 }) {
  const covered = ids === null ? null : new Set(ids.map(String));
  const present = new Set(incoming.filter(item => item.type === type).map(item => String(item[field])));
  return previous.map(item => item.type === type && (!covered || covered.has(String(item[field])))
    && Date.parse(item.created_at) <= startedAt && Date.parse(item.created_at) > oldest
    && !present.has(String(item[field])) ? { ...item, read: true, unreadCount: 0 } : item);
}

export function profileNotificationBadges(items,userId,ownedArticles=[]) {
  const counts={publicaciones:0,rescates:0,buzon:0};
  if(!userId)return counts;
  const owned=new Set(ownedArticles.map(article=>String(article.id||article.articulo_id)));
  const notifications=mergeNotificationHistory([],items,NOTIFICATION_STATE_LIMIT),receipts=new Set();
  for(const item of notifications){
    if(item.read||!item.unreadCount||!PROFILE_PENDING_TYPES.has(item.type))continue;
    let tab;
    if(item.type==='system_notice'){
      const key=item.receipt_id?receiptKey(item):String(item.id);
      if(receipts.has(key))continue;receipts.add(key);tab='buzon';
    }else if(owned.has(String(item.articulo_id))||['postulacion','venta'].includes(item.type))tab='publicaciones';
    else if(item.buyer_id&&String(item.buyer_id)!==String(userId))tab='publicaciones';
    else tab='rescates';
    counts[tab]+=item.unreadCount;
  }
  return counts;
}


export function profileInboxBadges(items,userId) {
 const notices=profileNotificationBadges(items.filter(item=>item.type==='system_notice'),userId).buzon;
 const support=profileNotificationBadges(items.filter(item=>item.type==='system_notice'&&item.receipt_kind==='support'),userId).buzon;
 const chats=profileNotificationBadges(items.filter(item=>item.type==='chat'),userId);
 return {system:Math.max(0,notices-support),conversations:support,users:chats.publicaciones+chats.rescates};
}

export function mergeInboxNotifications(previous,messages,startedAt=Date.now()) {
  const bellReads=new Set((previous||[]).filter(item=>item.type==='system_notice'&&item.bellRead).map(receiptKey));
  const receipts=(messages||[]).filter(message=>message.receipt_id).map(message=>({
    id:`inbox-${message.receipt_kind||'system'}-${message.receipt_id}`,type:'system_notice',
    receipt_id:message.receipt_id,receipt_kind:message.receipt_kind||'system',created_at:message.created_at,
    title:String(message.title||'Mensaje de MiBatute').slice(0,512),
    read:!!message.read_at,unreadCount:message.read_at?0:1,
    ...(bellReads.has(receiptKey(message))?{bellRead:true}:{}),
  }));
  const keys=new Set(receipts.map(receiptKey));
  const oldest = messages.length < 50 ? 0 : Math.min(...messages.map(message => Date.parse(message.created_at)));
  const settled = previous.map(item => item.type === 'system_notice' && item.receipt_kind !== 'support'
    && !keys.has(receiptKey(item)) && Date.parse(item.created_at) <= startedAt && Date.parse(item.created_at) > oldest
    ? { ...item, read:true, unreadCount:0 } : item);
  // The inbox snapshot is authoritative, including an intentional mark-as-unread.
  return mergeNotificationHistory([],[settled.filter(item=>item.type!=='system_notice'||!keys.has(receiptKey(item))),receipts].flat(),NOTIFICATION_STATE_LIMIT);
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
