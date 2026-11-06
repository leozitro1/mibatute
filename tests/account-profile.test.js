import test from 'node:test';
import assert from 'node:assert/strict';
import { readAccountProfile, publicationAccessError } from '../src/supabase/accountProfile.js';

const now = Date.parse('2026-11-06T12:00:00Z');
const profile = { id:'user', is_blocked:false, bloqueado:false, ban_until:null };
function client(result) {
  return { from(table) {
    assert.equal(table,'usuarios');
    return { select(fields) {
      assert.ok(!fields.split(',').includes('blocked'), 'The nonexistent alias must never break hydration');
      assert.ok(fields.split(',').includes('ban_until'));
      return { eq(field,uid) { assert.equal(field,'id');assert.equal(uid,'user');
        return { maybeSingle:async()=>result }; } };
    } };
  } };
}

test('a suspended profile survives a fresh session load and remains suspended on reload',async()=>{
  const data={...profile,ban_until:new Date(now+3600000).toISOString()};
  for(let reload=0;reload<2;reload++){
    const loaded=await readAccountProfile(client({data,error:null}),'user');
    assert.equal(loaded.error,null);
    assert.equal(loaded.data.ban_until,data.ban_until);
    assert.equal(loaded.data.accountStatusVerified,true);
    assert.match(publicationAccessError(loaded.data,now),/suspensión/);
  }
});

test('missing, mismatched, incomplete and failed profiles never grant publication access',async()=>{
  for(const result of [{data:null,error:null},{data:{...profile,id:'someone-else'},error:null},
    {data:{id:'user'},error:null},{data:{...profile,ban_until:'invalid'},error:null},
    {data:null,error:{code:'42703',message:'column does not exist'}}]){
    const loaded=await readAccountProfile(client(result),'user');
    assert.ok(loaded.error);assert.equal(loaded.data,null);
    assert.match(publicationAccessError({accountStatusVerified:false},now),/verificar/);
  }
  const loaded=await readAccountProfile({from(){throw new Error('Offline');}},'user');
  assert.equal(loaded.data,null);assert.equal(loaded.error.message,'Offline');
});

test('verified active accounts can publish, permanent blocks cannot, and suspension expires at its actual deadline',async()=>{
  const {data}=await readAccountProfile(client({data:profile,error:null}),'user');
  assert.equal(publicationAccessError(data,now),'');
  for(const field of ['is_blocked','bloqueado']) assert.match(publicationAccessError({...data,[field]:true},now),/bloqueada/);
  assert.match(publicationAccessError(null,now),/iniciar sesión/);
  assert.match(publicationAccessError({...data,accountStatusVerified:false},now),/verificar/);
  const suspended={...data,ban_until:new Date(now+1000).toISOString()};
  assert.match(publicationAccessError(suspended,now),/suspensión/);
  assert.equal(publicationAccessError(suspended,now+1000),'');
});
