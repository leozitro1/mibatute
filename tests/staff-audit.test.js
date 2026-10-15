import test from 'node:test';
import assert from 'node:assert/strict';
import { auditMemberLabel } from '../src/staff/audit.js';

test('team audit labels distinguish shared names, disabled members and retired identities',()=>{
  assert.equal(auditMemberLabel({id:'12345678-aaaa',name:'Ana',email:'ana@example.com',active:true}),'Ana · ana@example.com');
  assert.equal(auditMemberLabel({id:'12345678-aaaa',name:'Ana',email:'otra@example.com',active:false}),'Ana · otra@example.com · Desactivado');
  assert.equal(auditMemberLabel({id:'12345678-aaaa',name:'Cuenta retirada',email:'',retired:true}),'Cuenta retirada · Retirado (12345678)');
  assert.equal(auditMemberLabel({id:'12345678-aaaa',name:'ana@example.com',email:'ana@example.com',active:true}),'ana@example.com');
});
