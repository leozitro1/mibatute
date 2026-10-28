import test from 'node:test';
import assert from 'node:assert/strict';
import {creditBalanceIncreased} from '../src/components/creditBalanceAnimation.js';
test('balance animation starts on an actual increase, never initial load, decrease or duplicate confirmation',()=>{
 assert.equal(creditBalanceIncreased(null,5),false);
 assert.equal(creditBalanceIncreased(0,1),true);
 assert.equal(creditBalanceIncreased(5,8),true);
 assert.equal(creditBalanceIncreased(8,8),false);
 assert.equal(creditBalanceIncreased(8,7),false);
 assert.equal(creditBalanceIncreased(5,null),false);
 assert.equal(creditBalanceIncreased(5,NaN),false);
});
