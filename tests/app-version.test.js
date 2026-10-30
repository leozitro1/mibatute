import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers';
import { appVersion } from '../scripts/app-version.mjs';
import { watchAppVersion } from '../src/components/appVersion.js';

const tick = () => new Promise(resolve => setImmediate(resolve));
function fixture() {
  let clock = 0, version = 'version-one', calls = 0;
  const events = new Map(), documentEvents = new Map(), intervals = new Map(), timeouts = new Map(), updates = [];
  const browser = {
    document:{visibilityState:'visible',addEventListener:(name,fn) => documentEvents.set(name,fn),removeEventListener:name => documentEvents.delete(name)},
    navigator:{onLine:true},
    addEventListener:(name,fn) => events.set(name,fn),removeEventListener:name => events.delete(name),
    setInterval:fn => {intervals.set(1,fn);return 1;},clearInterval:id => intervals.delete(id),
    setTimeout:fn => {timeouts.set(1,fn);return 1;},clearTimeout:id => timeouts.delete(id),
    fetch:async(url,options) => {
      calls++;assert.equal(url,'/app-version.json');assert.equal(options.cache,'no-store');
      return {ok:true,json:async() => ({version})};
    },
  };
  return {browser,events,documentEvents,intervals,timeouts,updates,
    start:() => watchAppVersion({currentVersion:'version-one',onUpdate:value => updates.push(value),browser,now:() => clock}),
    advance:() => {clock+=60_001;},version:value => {version=value;},calls:() => calls};
}

test('build embeds the same unique version it publishes in the static file',()=>{
  const plugin=appVersion(), assets=[];
  plugin.generateBundle.call({emitFile:asset => assets.push(asset)});
  assert.equal(plugin.apply,'build');assert.equal(assets[0].fileName,'app-version.json');
  const version=JSON.parse(assets[0].source).version;
  assert.equal(JSON.parse(plugin.config().define['import.meta.env.APP_BUILD_ID']),version);
  assert.notEqual(appVersion().config().define['import.meta.env.APP_BUILD_ID'],JSON.stringify(version));
});

test('version checks are throttled, pause while hidden/offline and notify only once without reloading',async()=>{
  const f=fixture(), stop=f.start();await tick();
  assert.equal(f.calls(),1);assert.deepEqual(f.updates,[]);
  f.events.get('focus')();await tick();assert.equal(f.calls(),1);
  f.advance();f.browser.document.visibilityState='hidden';
  f.intervals.get(1)();await tick();assert.equal(f.calls(),1);
  f.browser.document.visibilityState='visible';f.browser.navigator.onLine=false;
  f.documentEvents.get('visibilitychange')();await tick();assert.equal(f.calls(),1);
  f.browser.navigator.onLine=true;f.version('version-two');
  f.events.get('online')();await tick();assert.deepEqual(f.updates,['version-two']);
  f.advance();f.intervals.get(1)();await tick();assert.equal(f.calls(),2);
  stop();assert.equal(f.events.size,0);assert.equal(f.documentEvents.size,0);assert.equal(f.intervals.size,0);assert.equal(f.timeouts.size,0);
});

test('invalid versions, network errors, HTML fallback and cleanup cannot produce false update banners',async()=>{
  const f=fixture();f.version('<!doctype html>');const stop=f.start();await tick();
  assert.deepEqual(f.updates,[]);
  f.advance();f.browser.fetch=async() => {throw new Error('offline');};f.events.get('focus')();await tick();
  f.advance();f.browser.fetch=async() => ({ok:true,json:async() => {throw new Error('html');}});f.events.get('focus')();await tick();
  f.advance();let finish,signal;
  f.browser.fetch=(_url,options) => {signal=options.signal;return new Promise(resolve => {finish=resolve;});};
  f.events.get('focus')();stop();assert.equal(signal.aborted,true);
  finish({ok:true,json:async() => ({version:'version-two'})});await tick();assert.deepEqual(f.updates,[]);
});
