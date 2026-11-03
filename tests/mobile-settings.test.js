import test from 'node:test';
import assert from 'node:assert/strict';
import postcss from 'postcss';
import mobileTextSize from '../scripts/mobile-text-size.mjs';
import {readTextSize,writeTextSize,TEXT_SIZES,TEXT_SIZE_KEY} from '../src/components/mobileTextPreferences.js';

test('text sizes are bounded, stay local and survive blocked storage for the session',()=>{
  const values=new Map(),events=[];
  const storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
  const browser={dispatchEvent:event=>events.push(event.type)};
  values.set(TEXT_SIZE_KEY,'invalid');assert.equal(readTextSize(storage),'normal');
  assert.deepEqual(Object.values(TEXT_SIZES),[1,1.125,1.25]);
  writeTextSize(storage,'large',browser);assert.equal(values.get(TEXT_SIZE_KEY),'large');assert.equal(readTextSize(storage),'large');
  const blocked={getItem:()=>{throw new Error('denied');},setItem:()=>{throw new Error('denied');}};
  writeTextSize(blocked,'largest',browser);assert.equal(readTextSize(blocked),'largest');
  writeTextSize(storage,'__proto__',browser);assert.equal(readTextSize(storage),'normal');
  assert.equal(values.get(TEXT_SIZE_KEY),'normal');assert.equal(events.length,3);
});

test('text scaling preserves default sizes, iPhone input minimums and layout dimensions',async()=>{
  const css='.card{font-size:14px;line-height:20px;width:200px;height:40px}.input{font-size:16px!important;line-height:1.5}.title{font-size:var(--text-xl)}.relative{font-size:1em}.custom{font-size:inherit}';
  const result=await postcss([mobileTextSize()]).process(css,{from:undefined});
  assert.match(result.css,/font-size:calc\(14px \* var\(--mb-text-scale, 1\)\)/);
  assert.match(result.css,/font-size:calc\(16px \* var\(--mb-text-scale, 1\)\)!important/);
  assert.match(result.css,/font-size:calc\(var\(--text-xl\) \* var\(--mb-text-scale, 1\)\)/);
  assert.match(result.css,/line-height:calc\(20px \* var\(--mb-text-scale, 1\)\)/);
  assert.match(result.css,/width:200px;height:40px/);assert.match(result.css,/line-height:1.5/);
  assert.match(result.css,/font-size:1em/);assert.match(result.css,/font-size:inherit/);
  const repeated=await postcss([mobileTextSize()]).process(result.css,{from:undefined});
  assert.equal(repeated.css,result.css,'Repeated CSS processing cannot multiply text sizes twice');
});
