import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {CONTACT_EMAIL,PAID_TOPUPS_ENABLED,REGISTRATION_ENABLED} from '../src/config/availability.js';
import checkout from '../api/wompi-checkout.js';

test('testing release keeps paid checkout disabled without a request to any provider',async t=>{
 assert.equal(PAID_TOPUPS_ENABLED,false);assert.equal(CONTACT_EMAIL,['info','mibatute.com'].join('@'));
 t.mock.method(globalThis,'fetch',()=>{throw new Error('Disabled checkout must not make network requests');});
 for(const method of ['GET','POST']){
  let body;const res={statusCode:0,setHeader(){},end(value){body=JSON.parse(value);}};
  await checkout({method,headers:{},body:{credits:2}},res);
  assert.equal(res.statusCode,method==='GET'?200:503);assert.equal(body.configured,false);assert.equal(body.checkoutUrl,undefined);
 }
});
test('complete release preserves registration without activating the strict draft guard',async()=>{
 const auth=await readFile(new URL('../src/components/AuthModal.jsx',import.meta.url),'utf8');
 const service=await readFile(new URL('../src/supabase/authService.js',import.meta.url),'utf8');
 const migration=await readFile(new URL('../supabase/migrations/2026-10-19-legal-foundation.sql',import.meta.url),'utf8');
 assert.equal(REGISTRATION_ENABLED,true);
 assert.ok(auth.includes('registrationAcceptance'));assert.ok(auth.includes('checked={acceptTerms}'));assert.ok(service.includes('supabase.auth.signUp'));
 assert.ok(!migration.includes('create trigger capture_registration_consent after insert'));
 assert.ok(!migration.includes('drop trigger if exists capture_registration_consent'));
});

test('all legal footer pages have direct deployment routes',async()=>{
 const {LEGAL_LINKS,registrationAcceptance,LEGAL_READY}=await import('../src/legal/config.js');
 assert.equal(LEGAL_READY,false);assert.equal(registrationAcceptance(false,true,true),null);assert.equal(registrationAcceptance(true,false,true),null);assert.equal(registrationAcceptance(true,true,false),null);assert.equal(registrationAcceptance(true,true,true).review_status,'draft');
 const config=JSON.parse(await readFile(new URL('../vercel.json',import.meta.url),'utf8'));
 const footer=await readFile(new URL('../src/components/Footer.jsx',import.meta.url),'utf8');
 for(const [path] of LEGAL_LINKS){assert.ok(config.rewrites.some(rule=>rule.source===path));assert.ok(footer.includes('to="'+path+'"'));}
});
