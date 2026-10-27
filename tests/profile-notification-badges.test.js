import {notificationCounts} from '../src/components/marketSignals.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { profileNotificationBadges,profileInboxBadges,mergeInboxNotifications,updateInboxNotification,mergeActivitySnapshot } from '../src/components/profileNotificationBadges.js';
import { mergeNotificationHistory,markNotificationHistoryRead,markNotificationBellRead,NOTIFICATION_STATE_LIMIT,writeNotificationHistory,readNotificationHistory } from '../src/components/notificationHistory.js';

const now='2026-10-16T12:00:00.000Z';
const item=(id,type,extra={})=>({id,type,created_at:now,read:false,unreadCount:1,...extra});

test('profile badges classify the bell data before rescue or inbox tabs are loaded',()=>{
  const items=[item('post','postulacion',{articulo_id:'mine',unreadCount:3}),item('sale','venta'),
    item('seller-chat','chat',{articulo_id:'not-loaded',buyer_id:'other',chat_id:'chat-one',unreadCount:2}),
    item('buyer-chat','chat',{buyer_id:'me',chat_id:'chat-two',unreadCount:4}),
    item('chosen','donation_accepted',{buyer_id:'me'}),item('notice','system_notice',{receipt_id:'receipt'}),
    item('read','postulacion',{read:true,unreadCount:10})];
  assert.deepEqual(profileNotificationBadges(items,'me'),{publicaciones:6,rescates:5,buzon:1});
  assert.deepEqual(profileNotificationBadges(items,null),{publicaciones:0,rescates:0,buzon:0});
});

test('private rating notices do not count and old winner notices do not double count acceptance',()=>{
  const items=[item('rating','rating_received',{articulo_id:'mine'}),item('pickup','pickup_proposed',{buyer_id:'me'}),
    item('accepted','donation_accepted',{articulo_id:'rescue',buyer_id:'me'}),item('legacy','ganador',{articulo_id:'rescue'}),
    item('rejected','donation_rejected'),item('expired','publication_expired')];
  assert.deepEqual(profileNotificationBadges(items,'me',[{id:'mine'}]),{publicaciones:1,rescates:3,buzon:0});
});

test('the in-memory state keeps all bounded groups but the dropdown history still persists only ten',()=>{
  const items=Array.from({length:25},(_,i)=>item(`chat-${i}`,'chat',{chat_id:`c-${i}`,buyer_id:'me'}));
  const state=mergeNotificationHistory([],items,NOTIFICATION_STATE_LIMIT);assert.equal(state.length,25);
  assert.equal(profileNotificationBadges(state,'me').rescates,25);
  const marked=markNotificationHistoryRead(state,{chatId:'c-0'},NOTIFICATION_STATE_LIMIT);
  assert.equal(marked.length,25);assert.equal(profileNotificationBadges(marked,'me').rescates,24);
  const storage={value:null,getItem(){return this.value;},setItem(key,value){this.value=value;}};
  writeNotificationHistory(storage,'me',state);assert.equal(readNotificationHistory(storage,'me').length,10);
  assert.equal(mergeNotificationHistory([],Array.from({length:350},(_,i)=>item(`n-${i}`,'chat')),10000).length,300);
});

test('reading a chat clears the shared badge and a new message in that group restores it',()=>{
  const incoming=item('chat','chat',{chat_id:'c',buyer_id:'me',unreadCount:3});
  const marked=markNotificationHistoryRead([incoming],{chatId:'c',through:now},NOTIFICATION_STATE_LIMIT);
  assert.equal(profileNotificationBadges(marked,'me').rescates,0);
  assert.equal(profileNotificationBadges(mergeNotificationHistory(marked,[incoming],NOTIFICATION_STATE_LIMIT),'me').rescates,0);
  const newer={...incoming,created_at:'2026-10-16T12:01:00.000Z',unreadCount:1};
  assert.equal(profileNotificationBadges(mergeNotificationHistory(marked,[newer],NOTIFICATION_STATE_LIMIT),'me').rescates,1);
});

test('inbox snapshots deduplicate the receipt already announced by the bell without copying private bodies',()=>{
  const activity=item('activity-system','system_notice',{receipt_id:'r'});
  const messages=[{receipt_id:'r',title:'Aviso',created_at:now,read_at:null,body:'Texto privado'},
    {receipt_id:'staff-r',receipt_kind:'staff',title:'Mensaje directo',created_at:now,read_at:null}];
  const result=mergeInboxNotifications([activity],messages);
  assert.equal(result.length,2);assert.equal(profileNotificationBadges(result,'me').buzon,2);
  assert.ok(result.every(message=>!Object.hasOwn(message,'body')));
  assert.equal(profileNotificationBadges(mergeNotificationHistory(result,[activity],NOTIFICATION_STATE_LIMIT),'me').buzon,2);
});

test('read, unread and delete synchronize inbox badges and stale bell events cannot resurrect a read receipt',()=>{
  const activity=item('activity','system_notice',{receipt_id:'r'});
  const loaded=mergeInboxNotifications([activity],[{receipt_id:'r',created_at:now,title:'Aviso',read_at:now}]);
  assert.equal(profileNotificationBadges(loaded,'me').buzon,0);
  const refreshed=mergeNotificationHistory(loaded,[{...activity,created_at:'2026-10-16T12:00:01.000Z'}],NOTIFICATION_STATE_LIMIT);
  assert.equal(profileNotificationBadges(refreshed,'me').buzon,0);
  const unread=updateInboxNotification(refreshed,'r','unread');assert.equal(profileNotificationBadges(unread,'me').buzon,1);
  assert.equal(profileNotificationBadges(updateInboxNotification(unread,'r','read'),'me').buzon,0);
  assert.equal(profileNotificationBadges(updateInboxNotification(unread,'r','delete'),'me').buzon,0);
  assert.equal(profileNotificationBadges(updateInboxNotification(unread,'r','read','staff'),'me').buzon,1);
});

test('a receipt acknowledgement affects only that namespace and preserves unrelated chat notices',()=>{
  const items=[item('system','system_notice',{receipt_id:'r'}),item('staff','system_notice',{receipt_id:'r',receipt_kind:'staff'}),item('chat','chat',{buyer_id:'me'})];
  const marked=markNotificationHistoryRead(items,{receiptId:'r',receiptKind:'system',through:now},NOTIFICATION_STATE_LIMIT);
  assert.deepEqual(profileNotificationBadges(marked,'me'),{publicaciones:0,rescates:1,buzon:1});
});

test('marking the bell read clears profile badges without altering chats or inbox receipts',()=>{
  const items=[item('post','postulacion'),item('chat','chat',{chat_id:'c',buyer_id:'me'}),item('notice','system_notice',{receipt_id:'r'})];
  const cleared={publicaciones:0,rescates:0,buzon:0},marked=markNotificationBellRead(items,items);
  assert.ok(marked.every(entry=>entry.bellRead&&!entry.read&&entry.unreadCount===1));
  assert.deepEqual(profileNotificationBadges(marked,'me'),cleared);
  assert.deepEqual(notificationCounts(marked),{chats:0,profile:0,byArticle:{}});
  const refreshed=mergeNotificationHistory(marked,items,NOTIFICATION_STATE_LIMIT);assert.ok(refreshed.every(entry=>entry.bellRead));
  const inbox=mergeInboxNotifications(refreshed,[{receipt_id:'r',created_at:now,title:'Aviso',read_at:null}]);
  assert.equal(inbox.find(entry=>entry.receipt_id==='r').bellRead,true);assert.deepEqual(profileNotificationBadges(inbox,'me'),cleared);
  const newer={...items[1],created_at:'2026-10-16T12:01:00.000Z'};
  assert.ok(!markNotificationBellRead([newer],items)[0].bellRead,'Arrivals newer than the snapshot remain unread');
  const updated=mergeNotificationHistory(marked,[newer],NOTIFICATION_STATE_LIMIT);
  assert.ok(!updated.find(entry=>entry.id==='chat').bellRead);
  assert.equal(profileNotificationBadges(updated,'me').rescates,1);
});

test('bell-only acknowledgements persist locally without changing underlying unread counts',()=>{
  const notification=item('chat','chat',{chat_id:'c',buyer_id:'me',unreadCount:4});
  const storage={value:null,getItem(){return this.value;},setItem(key,value){this.value=value;}};
  writeNotificationHistory(storage,'me',markNotificationBellRead([notification],[notification]));
  const loaded=readNotificationHistory(storage,'me');assert.equal(loaded[0].bellRead,true);assert.equal(loaded[0].unreadCount,4);
  assert.equal(profileNotificationBadges(loaded,'me').rescates,0);
});

test('a support read snapshot cannot clear a reply that arrived afterwards',()=>{
  const notice=item('support','system_notice',{receipt_id:'t',receipt_kind:'support'});
  const newer={...notice,created_at:'2026-10-16T12:01:00.000Z'};
  assert.equal(updateInboxNotification([newer],'t','read','support',now)[0].read,false);
  assert.equal(updateInboxNotification([notice],'t','read','support',now)[0].read,true);
});

test('a later support answer restores the unread badge on the same conversation',()=>{
  const read=item('support','system_notice',{receipt_id:'thread',receipt_kind:'support',read:true,bellRead:true});
  const reply={...read,read:false,bellRead:false,created_at:'2026-10-16T12:01:00.000Z'};
  const result=mergeNotificationHistory([read],[reply],NOTIFICATION_STATE_LIMIT);
  assert.equal(result[0].read,false);assert.equal(result[0].bellRead,false);
  assert.equal(profileNotificationBadges(result,'me').buzon,1);
});

test('removing support threads clears only their notices, including old offline cache on refresh',()=>{
 const support=item('support','system_notice',{receipt_id:'thread',receipt_kind:'support'});
 const system=item('system','system_notice',{receipt_id:'thread'});
 assert.deepEqual(updateInboxNotification([support,system],'thread','delete','support'),[system]);
 assert.deepEqual(mergeActivitySnapshot([support,system],[],Date.parse(now)),[system]);
 const newer={...support,created_at:'2026-10-16T12:01:00.000Z'};
 assert.equal(mergeActivitySnapshot([newer],[],Date.parse(now)).length,1,'A concurrent new response survives an older HTTP snapshot');
 assert.equal(mergeActivitySnapshot([support],[support],Date.parse(now)).length,1);
});


test('inbox categories count system, support and user chats using existing unread and bell state',()=>{
 const items=[item('system','system_notice',{receipt_id:'s'}),item('support','system_notice',{receipt_kind:'support',receipt_id:'t'}),item('chat','chat',{chat_id:'c',buyer_id:'me',unreadCount:3}),item('read-chat','chat',{chat_id:'r',read:true}),item('bell','chat',{chat_id:'b',bellRead:true})];
 assert.deepEqual(profileInboxBadges(items,'me'),{system:1,conversations:1,users:3});
 assert.deepEqual(profileInboxBadges(markNotificationBellRead(items,items),'me'),{system:0,conversations:0,users:0});
 assert.deepEqual(profileInboxBadges(items,null),{system:0,conversations:0,users:0});
});
