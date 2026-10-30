import test from 'node:test';
import assert from 'node:assert/strict';
import { trackChatViewport } from '../src/components/chatViewport.js';

function fixture() {
  const values=new Map(),events=new Map(),mediaEvents=new Map(),frames=new Map();let id=0;
  const viewport={height:800,offsetTop:0,scale:1,addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:name=>events.delete(name)};
  const mobile={matches:true,addEventListener:(name,fn)=>mediaEvents.set(name,fn),removeEventListener:name=>mediaEvents.delete(name)};
  const element={style:{setProperty:(name,value)=>values.set(name,value),removeProperty:name=>values.delete(name)}};
  const browser={visualViewport:viewport,matchMedia:()=>mobile,requestAnimationFrame:fn=>{frames.set(++id,fn);return id;},cancelAnimationFrame:key=>frames.delete(key)};
  const flush=()=>{const callbacks=[...frames.values()];frames.clear();callbacks.forEach(fn=>fn());};
  return {values,events,mediaEvents,frames,viewport,mobile,element,browser,flush};
}

test('chat follows the keyboard viewport, coalesces events and restores height when it closes',()=>{
  const f=fixture(),stop=trackChatViewport(f.element,f.browser);
  assert.equal(f.values.get('--chat-viewport-height'),'800px');
  f.viewport.height=420;f.viewport.offsetTop=45;
  f.events.get('resize')();f.events.get('scroll')();assert.equal(f.frames.size,1);
  f.flush();assert.equal(f.values.get('--chat-viewport-height'),'420px');assert.equal(f.values.get('--chat-viewport-top'),'45px');
  f.viewport.height=800;f.viewport.offsetTop=0;f.events.get('resize')();f.flush();
  assert.equal(f.values.get('--chat-viewport-height'),'800px');assert.equal(f.values.get('--chat-viewport-top'),'0px');
  f.events.get('resize')();stop();
  assert.equal(f.values.size,0);assert.equal(f.events.size,0);assert.equal(f.mediaEvents.size,0);assert.equal(f.frames.size,0);
});

test('chat leaves pinch zoom and desktop sizing alone and tolerates missing visual viewport',()=>{
  const f=fixture(),stop=trackChatViewport(f.element,f.browser);
  f.viewport.scale=2;f.viewport.height=200;f.events.get('resize')();f.flush();
  assert.equal(f.values.get('--chat-viewport-height'),'800px','Pinch zoom does not resize the layout');
  f.mobile.matches=false;f.mediaEvents.get('change')();f.flush();assert.equal(f.values.size,0);
  stop();trackChatViewport(f.element,{})();// Unsupported browsers retain the CSS fallback.
});
