import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {CONTACT_EMAIL,PAID_TOPUPS_ENABLED} from '../src/config/availability.js';
import checkout from '../api/wompi-checkout.js';

test('testing release keeps paid checkout disabled without a request to any provider',async t=>{
 assert.equal(PAID_TOPUPS_ENABLED,false);assert.equal(CONTACT_EMAIL,'edgarleonardo202@gmail.com');
 t.mock.method(globalThis,'fetch',()=>{throw new Error('Disabled checkout must not make network requests');});
 for(const method of ['GET','POST']){
  let body;const res={statusCode:0,setHeader(){},end(value){body=JSON.parse(value);}};
  await checkout({method,headers:{},body:{credits:2}},res);
  assert.equal(res.statusCode,method==='GET'?200:503);assert.equal(body.configured,false);assert.equal(body.checkoutUrl,undefined);
 }
});
test('partial release excludes the draft registration guard and preserves explicit acceptance',async()=>{
 const auth=await readFile(new URL('../src/components/AuthModal.jsx',import.meta.url),'utf8');
 const service=await readFile(new URL('../src/supabase/authService.js',import.meta.url),'utf8');
 assert.ok(auth.includes('acceptTerms'));assert.ok(auth.includes('checked={acceptTerms}'));assert.ok(service.includes('supabase.auth.signUp'));
 assert.ok(!auth.includes('LEGAL_READY'));assert.ok(!service.includes('LEGAL_READY'));
 await assert.rejects(readFile(new URL('../supabase/migrations/2026-10-19-legal-foundation.sql',import.meta.url)),{code:'ENOENT'});
});
