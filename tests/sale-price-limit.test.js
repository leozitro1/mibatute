import test from 'node:test';
import assert from 'node:assert/strict';
import {salePriceLimit,MAX_VENTA_COP} from '../src/config/salePriceLimit.js';
test('half wage excludes transport, rounds down and selects years in Colombia',()=>{
 assert.equal(MAX_VENTA_COP,875452);
 assert.deepEqual(salePriceLimit(new Date('2027-01-01T04:59:59Z'),{2026:1750905,2027:2000000}),{year:2026,amount:875452});
 assert.deepEqual(salePriceLimit(new Date('2027-01-01T05:00:00Z'),{2026:1750905,2027:2000000}),{year:2027,amount:1000000});
 assert.deepEqual(salePriceLimit(new Date('2028-06-01T12:00:00Z')),{year:2026,amount:875452});
});
