import test from 'node:test';
import assert from 'node:assert/strict';
import { CORRECTION_REASONS, correctionReason } from '../src/staff/moderation.js';

test('correction requires a known reason and accepts optional trimmed details',()=>{
  assert.equal(correctionReason(''),'');
  assert.equal(correctionReason('unknown','Custom text'),'');
  assert.equal(new Set(CORRECTION_REASONS.map(([code])=>code)).size,CORRECTION_REASONS.length);
  for(const [code,label] of CORRECTION_REASONS) {
    assert.equal(correctionReason(code),label);
    assert.equal(correctionReason(code,'   '),label);
    assert.equal(correctionReason(code,'  Detalle adicional.  '),`${label}: Detalle adicional.`);
    assert.ok(label.length>=8&&label.length<500);
    const limit=500-label.length-2;
    assert.equal(correctionReason(code,'x'.repeat(limit)).length,500);
  }
});
