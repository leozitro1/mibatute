import test from 'node:test';
import assert from 'node:assert/strict';
import {createForegroundNoticeGate,createIconBadgeWriter,iconBadgeSupport,localNoticeCount,localNoticeMetadata,requestIconBadgePermission} from '../src/components/localAppNotices.js';
import {noticePreferenceKey,readNoticePreferences,writeNoticePreferences} from '../src/components/localNoticePreferences.js';

const now=Date.parse('2026-10-30T12:00:00Z');
const item=(patch={})=>({id:'chat-1',type:'chat',chat_id:'c1',articulo_id:'a1',created_at:new Date(now).toISOString(),read:false,unreadCount:1,...patch});

test('local badges count pending groups only for requests, acceptances and messages without private content',()=>{
 const notice=item({title:'Nombre privado',subtitle:'Mensaje privado',thumb:'https://private.example/photo'});
 assert.deepEqual(localNoticeMetadata(notice),{kind:'message',time:now,group:'message:c1',chatId:'c1'});
 assert.equal(localNoticeCount([notice,notice,item({id:'post-1',type:'postulacion'}),item({id:'accepted-1',type:'donation_accepted'}),item({id:'winner-1',type:'ganador'})]),3);
 for(const patch of [{read:true},{bellRead:true},{unreadCount:0},{type:'system_notice'},{type:'pickup_proposed'},{type:'rating_received'},{created_at:'invalid'}])assert.equal(localNoticeMetadata(item(patch)),null);
});

test('foreground banners discard history, hidden events, duplicates and the chat being read; bursts stay bounded',()=>{
 let clock=now;const gate=createForegroundNoticeGate(()=>clock);
 assert.equal(gate(item(),{visible:false}),null);
 assert.equal(gate(item(),{visible:true}),null,'hidden events are not replayed on return');
 assert.equal(gate(item({chat_id:'reading'}),{visible:true,activeChatId:'reading'}),null);
 assert.equal(gate(item({chat_id:'old',created_at:new Date(now-31000).toISOString()}),{visible:true}),null);
 assert.equal(gate(item({chat_id:'future',created_at:new Date(now+6000).toISOString()}),{visible:true}),null);
 const second=item({chat_id:'c2'});
 assert.deepEqual(gate(second,{visible:true}),{kind:'message',group:'message:c2',chatId:'c2',at:now});
 assert.equal(gate(second,{visible:true}),null);
 clock+=1000;
 assert.equal(gate(item({chat_id:'c2',created_at:new Date(clock).toISOString()}),{visible:true}),null);
 clock+=8000;
 assert.equal(gate(item({chat_id:'c2',created_at:new Date(clock).toISOString()}),{visible:true}).kind,'message');
 assert.equal(gate(item({id:'sale',type:'sale_approved',chat_id:'c3',created_at:new Date(clock).toISOString()}),{visible:true}).kind,'accepted');
 const accountGate=createForegroundNoticeGate(()=>now,'account-a');
 assert.equal(accountGate(item(),{visible:true,uid:'account-b'}),null);
 assert.equal(accountGate(item(),{visible:true}),null);
 assert.equal(accountGate(item(),{visible:true,uid:'account-a'}).kind,'message');
});

test('message previews are bounded plain text, ephemeral and restricted to message notices',()=>{
 const gate=createForegroundNoticeGate(()=>now);
 const notice=item({subtitle:'Silla de oficina'});
 const banner=gate(notice,{visible:true,messagePreview:' Hola,\n ¿sigue disponible? '});
 assert.equal(banner.body,'Hola, ¿sigue disponible?');
 assert.equal(banner.context,'Silla de oficina');
 assert.equal(notice.body,undefined,'message body is not added to stored bell history');
 assert.equal(localNoticeMetadata(notice).body,undefined,'badge metadata has no message text');
 const long=createForegroundNoticeGate(()=>now)(item(),{visible:true,messagePreview:'a'.repeat(500)});
 assert.equal(long.body.length,220);assert.ok(long.body.endsWith('…'));
 const invalid=createForegroundNoticeGate(()=>now)(item(),{visible:true,messagePreview:{text:'invalid'}});
 assert.equal(invalid.body,undefined);
 const request=createForegroundNoticeGate(()=>now)(item({type:'postulacion'}),{visible:true,messagePreview:'not a message'});
 assert.equal(request.body,undefined);
});

test('iPhone badge permission is explicit and uses no worker or push subscription; denial and unsupported contexts are safe',async()=>{
 let prompts=0;
 const browser={isSecureContext:true,navigator:{userAgent:'iPhone',setAppBadge:async()=>{}},Notification:{permission:'default',requestPermission:()=>{prompts++;return Promise.resolve('granted');}}};
 assert.deepEqual(iconBadgeSupport(browser),{supported:true,needsPermission:true});
 assert.equal(prompts,0);
 const permission=requestIconBadgePermission(browser);
 assert.equal(prompts,1,'native request begins directly from the caller gesture');
 assert.equal(await permission,true);
 browser.Notification.permission='denied';
 assert.equal(await requestIconBadgePermission(browser),false);assert.equal(prompts,1);
 assert.equal(await requestIconBadgePermission({...browser,isSecureContext:false}),false);
 assert.equal(await requestIconBadgePermission({isSecureContext:true,navigator:{userAgent:'Android'}}),false);
 assert.equal(await requestIconBadgePermission({isSecureContext:true,navigator:{userAgent:'Other',setAppBadge:async()=>{}}}),true);
});

test('native badge writes are serialized; sign-out clears after an in-flight count and failures never block subsequent updates',async()=>{
 const calls=[];let release;
 const write=createIconBadgeWriter({setAppBadge:count=>{calls.push(count);return new Promise(resolve=>{release=resolve;});},clearAppBadge:async()=>{calls.push(0);}});
 const first=write(4);write(7);const logout=write(0);
 assert.deepEqual(calls,[4]);release();await Promise.all([first,logout]);assert.deepEqual(calls,[4,0]);
 await write(0);assert.deepEqual(calls,[4,0,0]);
 const errors=createIconBadgeWriter({setAppBadge:async value=>{calls.push(value);throw new Error('Unavailable');},clearAppBadge:async()=>{calls.push(0);throw new Error('Unavailable');}});
 await errors(999);await errors(-1);assert.deepEqual(calls.slice(-2),[300,0]);
 const fallback=[];await createIconBadgeWriter({setAppBadge:async value=>fallback.push(value)})(0);assert.deepEqual(fallback,[0]);
 await createIconBadgeWriter({})(3);
});

test('device preferences isolate accounts, persist only booleans and remain usable if storage is blocked',()=>{
 const values=new Map(),storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
 const browser={dispatchEvent:()=>{}};
 assert.deepEqual(readNoticePreferences(storage,'test-a'),{badge:false,banners:true});
 writeNoticePreferences(storage,'test-a',{badge:true,banners:false,private:'omit'},browser);
 assert.deepEqual(readNoticePreferences(storage,'test-a'),{badge:true,banners:false});
 assert.deepEqual(readNoticePreferences(storage,'test-b'),{badge:false,banners:true});
 assert.deepEqual(JSON.parse(values.get(noticePreferenceKey('test-a'))),{badge:true,banners:false});
 const blocked={getItem:()=>{throw new Error('Blocked');},setItem:()=>{throw new Error('Blocked');}};
 writeNoticePreferences(blocked,'test-blocked',{badge:true,banners:false},browser);
 assert.deepEqual(readNoticePreferences(blocked,'test-blocked'),{badge:true,banners:false});
 assert.equal(noticePreferenceKey('../bad'),null);
});
