import test from 'node:test';
import assert from 'node:assert/strict';
import { passwordError,recoveryCredentials,staffEmail } from '../src/staff/passwords.js';

test('staff email aliases preserve the role domain and accept canonical emails',()=>{
  assert.equal(staffEmail(' Leozitro ',true),'leozitro@master.mibatute.com');
  assert.equal(staffEmail(' Supervisor '),'supervisor@admin.mibatute.com');
  assert.equal(staffEmail(' Equipo@Example.com ',true),'equipo@example.com');
});
test('staff passwords require length and matching confirmation',()=>{
  assert.ok(passwordError('short','short'));
  assert.ok(passwordError('a'.repeat(129),'a'.repeat(129)));
  assert.ok(passwordError('a'.repeat(12),'b'.repeat(12)));
  assert.equal(passwordError('Una clave larga!','Una clave larga!'),'');
});
test('recovery accepts only a complete recovery session, never an ordinary login hash',()=>{
  assert.equal(recoveryCredentials('#access_token=x&refresh_token=y&type=signup'),null);
  assert.equal(recoveryCredentials(''),null);
  assert.deepEqual(recoveryCredentials('#type=recovery&access_token=x'),{error:true});
  assert.deepEqual(recoveryCredentials('#type=recovery&access_token=x&refresh_token=y'),{access_token:'x',refresh_token:'y'});
});
