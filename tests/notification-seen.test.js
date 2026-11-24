import test from 'node:test';
import assert from 'node:assert/strict';
import { rememberNotificationSeen, forgetNotificationSeen, NOTIFICATION_SEEN_LIMIT } from '../src/components/notificationSeen.js';
import { readNotificationHistory, writeNotificationHistory, markNotificationBellRead } from '../src/components/notificationHistory.js';
import { updateInboxNotification } from '../src/components/profileNotificationBadges.js';
const notice = (id, extra = {}) => ({id:`inbox-system-${id}`,type:'system_notice',receipt_id:String(id),receipt_kind:'system',created_at:'2026-11-24T12:00:00Z',read:false,unreadCount:1,...extra});
const memory = () => {
  const records = new Map();
  return {records,getItem:key=>records.get(key)??null,setItem:(key,value)=>records.set(key,value)};
};

test('refresh and re-login retain seen system notices beyond the ten visible rows with no server calls', () => {
  const storage = memory(), incoming = Array.from({length:30},(_,i)=>notice(i));
  const acknowledged = rememberNotificationSeen(storage,'alice',markNotificationBellRead(incoming,incoming));
  writeNotificationHistory(storage,'alice',acknowledged);
  assert.equal(readNotificationHistory(storage,'alice').length,10);
  const refreshed = rememberNotificationSeen(storage,'alice',incoming);
  assert.equal(refreshed.length,30);
  assert.ok(refreshed.every(item=>item.bellRead));
  assert.ok(refreshed.every(item=>!item.read && item.unreadCount===1));
  assert.ok(rememberNotificationSeen(storage,'bob',incoming).every(item=>!item.bellRead));
  const data=JSON.parse(storage.records.get('mb_notification_seen_alice'));
  assert.equal(data.length,30);
  assert.ok(data.every(row=>row.length===2 && typeof row[0]==='string' && Number.isSafeInteger(row[1])));
});

test('new chat/support events remain unread and receipts use separate kinds', () => {
  const storage=memory();
  const old=notice('same',{receipt_kind:'support'});
  rememberNotificationSeen(storage,'alice',[{...old,bellRead:true}]);
  const newer={...old,created_at:'2026-11-24T12:01:00Z'};
  assert.equal(rememberNotificationSeen(storage,'alice',[newer])[0].bellRead,undefined);
  assert.equal(rememberNotificationSeen(storage,'alice',[notice('same')])[0].bellRead,undefined);
  const chat={id:'chat-a',type:'chat',chat_id:'a',created_at:old.created_at,read:true};
  rememberNotificationSeen(storage,'alice',[chat]);
  assert.equal(rememberNotificationSeen(storage,'alice',[{...chat,read:false,created_at:newer.created_at}])[0].bellRead,undefined);
  rememberNotificationSeen(storage,'alice',[{...notice('fixed'),read:true}]);
  assert.equal(rememberNotificationSeen(storage,'alice',[notice('fixed',{id:'activity-fixed'})])[0].bellRead,true);
});

test('explicit mark-as-unread clears local acknowledgement without affecting other receipts', () => {
  const storage=memory(), original=[notice('a',{read:true,bellRead:true}),notice('b',{read:true,bellRead:true})];
  rememberNotificationSeen(storage,'alice',original);
  forgetNotificationSeen(storage,'alice','a');
  const updated=updateInboxNotification(original,'a','unread');
  const result=rememberNotificationSeen(storage,'alice',updated);
  assert.equal(result.find(item=>item.receipt_id==='a').bellRead,false);
  assert.equal(result.find(item=>item.receipt_id==='a').read,false);
  assert.equal(result.find(item=>item.receipt_id==='b').bellRead,true);
});

test('record is bounded and corrupt or unavailable storage never breaks notification loading', () => {
  const storage=memory();
  for(let batch=0;batch<5;batch++)rememberNotificationSeen(storage,'alice',Array.from({length:300},(_,i)=>notice(batch*300+i,{bellRead:true})));
  assert.equal(JSON.parse(storage.records.get('mb_notification_seen_alice')).length,NOTIFICATION_SEEN_LIMIT);
  for(const raw of ['{bad','null','{}',' '.repeat(524289),'[["__proto__",-1]]']){
    storage.records.set('mb_notification_seen_alice',raw);
    assert.equal(rememberNotificationSeen(storage,'alice',[notice('a')])[0].bellRead,undefined);
  }
  const denied={getItem(){throw Error('blocked');},setItem(){throw Error('quota');}};
  assert.equal(rememberNotificationSeen(denied,'alice',[notice('a',{bellRead:true})])[0].bellRead,true);
  assert.doesNotThrow(()=>forgetNotificationSeen(denied,'alice','a'));
  rememberNotificationSeen(storage,'', [notice('a',{bellRead:true})]);
  assert.equal(storage.records.has('mb_notification_seen_'),false);
});
