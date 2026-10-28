import test from 'node:test';
import assert from 'node:assert/strict';
import {emailDeliveryConfig} from '../server/emailDeliveryConfig.js';
test('email readiness distinguishes controls, manual delivery and schedule without exposing credentials',()=>{
 const missing=emailDeliveryConfig({});
 assert.equal(missing.manualReady,false);assert.equal(missing.automaticReady,false);
 assert.ok(missing.missing.includes('EMAIL_NOTIFICATIONS_ENABLED'));
 const env={EMAIL_NOTIFICATIONS_ENABLED:'true',RESEND_API_KEY:'private-resend',NOTIFICATION_EMAIL_FROM:'MiBatute <noreply@example.com>',SUPABASE_SERVICE_ROLE_KEY:'private-role',VITE_SUPABASE_URL:'https://fixture.supabase.co'};
 assert.equal(emailDeliveryConfig(env).manualReady,true);
 assert.deepEqual(emailDeliveryConfig(env).missing,['CRON_SECRET']);
 const ready=emailDeliveryConfig({...env,CRON_SECRET:'private-cron'});
 assert.equal(ready.automaticReady,true);assert.deepEqual(ready.missing,[]);
 assert.doesNotMatch(JSON.stringify(ready),/private-|noreply/);
 assert.equal(emailDeliveryConfig({...env,EMAIL_NOTIFICATIONS_ENABLED:'false'}).manualReady,false);
});

test('authenticated readiness check never claims the queue or contacts Resend, even when sending is enabled',async()=>{
 const process=(await import('node:process')).default;
 const handler=(await import('../api/email-dispatch.js')).default;
 const keys=['SUPABASE_URL','SUPABASE_ANON_KEY','EMAIL_NOTIFICATIONS_ENABLED'];
 const previous=Object.fromEntries(keys.map(key=>[key,process.env[key]])),originalFetch=globalThis.fetch,calls=[];
 try{
  Object.assign(process.env,{SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_ANON_KEY:'test-anon',EMAIL_NOTIFICATIONS_ENABLED:'true'});
  globalThis.fetch=async(url)=>{calls.push(String(url));assert.match(String(url),/\/rpc\/staff_email_settings$/);return new Response('{}',{status:200});};
  let status,body;
  await handler({method:'POST',url:'/api/email-dispatch?check=1',headers:{authorization:'Bearer test-master'}},{setHeader(){},end(value){status=this.statusCode;body=JSON.parse(value);}});
  assert.equal(status,200);assert.equal(body.sent,0);assert.equal(calls.length,1);
  assert.ok(Object.hasOwn(body,'manualReady'));assert.ok(Object.hasOwn(body,'automaticReady'));
 }finally{globalThis.fetch=originalFetch;for(const key of keys){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}}
});
