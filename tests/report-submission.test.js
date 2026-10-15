import test from 'node:test';
import assert from 'node:assert/strict';
import { submitArticleReport,submitChatReport } from '../src/supabase/reports.js';

test('article report uses one RPC without invented table fields or a second profile request',async()=>{
  const calls=[];
  const client={rpc:async(name,args)=>{calls.push({name,args});return {data:{id:'report',alreadyExists:false},error:null};}};
  assert.equal((await submitArticleReport(client,'article','Spam',' detalle ')).id,'report');
  assert.deepEqual(calls,[{name:'submit_article_report',args:{p_article:'article',p_reason:'Spam',p_details:'detalle'}}]);
});
test('chat reporting never trusts client peer identities or client-supplied evidence',async()=>{
  const client={rpc:async(name,args)=>{assert.equal(name,'submit_chat_report');assert.deepEqual(args,{p_chat:'chat',p_reason:'acoso',p_details:'detalle'});return {data:{alreadyExists:true}};}};
  assert.equal((await submitChatReport(client,'chat','acoso',' detalle ')).alreadyExists,true);
});
test('report API errors propagate to the form rather than showing a false success',async()=>{
  const failure=new Error('No autorizado');const client={rpc:async()=>({error:failure})};
  await assert.rejects(submitArticleReport(client,'article','Spam',''),/No autorizado/);
  await assert.rejects(submitChatReport(client,'chat','acoso','detalle'),/No autorizado/);
});
