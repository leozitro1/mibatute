import test from 'node:test';
import assert from 'node:assert/strict';
import {patchMobileFilters,resetMobileFilters,mobileFilterChips} from '../src/components/mobileCatalogFilters.js';

const value={category:'Hogar & Muebles',subcategory:'Muebles',city:'Bogotá',locality:'Suba',kind:'donacion',onlyActive:true,minCondition:7,sort:'newest',hideOwn:true,searchMode:'specific'};

test('category and city changes clear dependent filters without mutating the applied selection', () => {
  const next=patchMobileFilters(value,{category:'Ropa & Textiles',city:'Cali'});
  assert.equal(next.subcategory,'');assert.equal(next.locality,'Todas');
  assert.equal(next.kind,'donacion');assert.equal(next.minCondition,7);
  assert.equal(value.subcategory,'Muebles');assert.equal(value.locality,'Suba');
  assert.equal(patchMobileFilters(value,{sort:'oldest'}).subcategory,'Muebles');
  assert.equal(patchMobileFilters(value,{city:'Bogotá'}).locality,'Suba');
});

test('reset preserves the chosen city and clears every optional catalog filter', () => {
  const reset=resetMobileFilters(value);
  assert.deepEqual(reset,{category:'Todo',subcategory:'',city:'Bogotá',locality:'Todas',kind:'todo',onlyActive:false,minCondition:0,sort:'random',hideOwn:false,searchMode:'related'});
  assert.deepEqual(mobileFilterChips(reset),[]);
  assert.equal(value.minCondition,7);
});

test('each applied-filter chip removes its own constraint and preserves unrelated choices', () => {
  const chips=mobileFilterChips(value);
  assert.equal(chips.length,8);
  assert.equal(new Set(chips.map(chip=>chip.key)).size,8);
  for(const chip of chips){
    const next=patchMobileFilters(value,chip.patch);
    assert.ok(!mobileFilterChips(next).some(item=>item.key===chip.key));
    assert.equal(next.city,value.city);
    if(chip.key!=='category')assert.equal(next.subcategory,'Muebles');
    if(chip.key!=='condition')assert.equal(next.minCondition,7);
  }
  assert.equal(mobileFilterChips({...resetMobileFilters(value),kind:'destacado'})[0].label,'Destacadas');
});
