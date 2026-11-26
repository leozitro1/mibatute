import test from 'node:test';
import assert from 'node:assert/strict';
import {installGoogleTagManager,GTM_CONTAINER_ID,GTM_ROUTE_EVENT} from '../src/analytics/googleTagManager.js';
import {METRICS_KEY,METRICS_EVENT} from '../src/legal/preferences.js';

function fixture({choice='accepted',enabled=true,hostname='www.mibatute.com',pathname='/',signals={},search='',hash=''}={}) {
 const values=new Map([[METRICS_KEY,choice]]),scripts=[],cookies=[];
 const win=new EventTarget(),doc=new EventTarget();
 let reloads=0;
 win.location={hostname,pathname,search,hash,reload(){reloads++;}};
 win.navigator=signals;
 win.localStorage={getItem:key=>values.get(key)};
 doc.visibilityState='visible';
 Object.defineProperty(doc,'cookie',{get:()=>'_ga=one; _ga_ABC=two; session=private',set:value=>{cookies.push(value);}});
 doc.getElementById=id=>scripts.find(script=>script.id===id);
 doc.createElement=()=>({remove(){const index=scripts.indexOf(this);if(index>=0)scripts.splice(index,1);}});
 doc.head={appendChild:script=>scripts.push(script)};
 const dispatch=(name,props={})=>{const event=new Event(name);Object.assign(event,props);win.dispatchEvent(event);};
 const dispose=installGoogleTagManager({win,doc,enabled});
 return {win,doc,values,scripts,cookies,dispatch,dispose,get reloads(){return reloads;}};
}

test('Google remains unloaded without a new explicit choice, including old metrics consent',()=>{
 for(const choice of [null,'rejected']){
  const f=fixture({choice});f.values.set('mb_optional_metrics_v1','accepted');f.dispatch('pageshow');
  assert.equal(f.scripts.length,0);assert.equal(f.win.dataLayer,undefined);
 }
});

test('local, previews, private routes, token URLs and browser privacy signals do not load Google',()=>{
 for(const options of [{enabled:false},{hostname:'localhost'},{hostname:'preview.vercel.app'},{pathname:'/gestion/operaciones'},{pathname:'/datos-personales'},{search:'?code=secret'},{hash:'#access_token=secret'},{signals:{doNotTrack:'1'}},{signals:{globalPrivacyControl:true}}]){
  const f=fixture(options);assert.equal(f.scripts.length,0);assert.equal(f.win.dataLayer,undefined);
 }
 const f=fixture({choice:null});f.win.localStorage.getItem=()=>{throw Error('blocked');};f.dispatch('pageshow');assert.equal(f.scripts.length,0);
});

test('acceptance loads the container once with analytics consent and advertising denied before startup',()=>{
 const f=fixture({choice:null});f.values.set(METRICS_KEY,'accepted');f.dispatch(METRICS_EVENT,{detail:{accepted:true}});
 f.dispatch('pageshow');f.dispatch(METRICS_EVENT,{detail:{accepted:true}});
 assert.equal(f.scripts.length,1);assert.equal(f.scripts[0].async,true);
 assert.equal(f.scripts[0].src,`https://www.googletagmanager.com/gtm.js?id=${GTM_CONTAINER_ID}`);
 const commands=f.win.dataLayer.slice(0,3).map(command=>Array.from(command));
 assert.equal(commands[0][2].analytics_storage,'denied');
 assert.equal(commands[2][2].analytics_storage,'granted');
 for(const key of ['ad_storage','ad_user_data','ad_personalization'])assert.equal(commands[2][2][key],'denied');
 assert.equal(f.win.dataLayer[3].event,'gtm.js');
});

test('withdrawal denies consent, clears only analytics cookies and unloads running tags once',()=>{
 const f=fixture();
 // An explicit rejection also takes effect if writing the preference failed.
 f.dispatch(METRICS_EVENT,{detail:{accepted:false}});f.dispatch('pageshow');
 assert.equal(f.reloads,1);assert.equal(f.scripts.length,0);
 assert.equal(Array.from(f.win.dataLayer.at(-1))[2].analytics_storage,'denied');
 assert.ok(f.cookies.some(cookie=>cookie.startsWith('_ga=')));
 assert.ok(f.cookies.every(cookie=>!cookie.includes('session=')));
});

test('cross-tab rejection and clearing storage withdraw consent; rejection before loading needs no reload',()=>{
 for(const key of [METRICS_KEY,null]){
  const f=fixture();f.values.clear();f.dispatch('storage',{key});assert.equal(f.reloads,1);
 }
 const f=fixture({choice:null});f.dispatch(METRICS_EVENT,{detail:{accepted:false}});assert.equal(f.reloads,0);
});

test('SPA navigation to an excluded page unloads tags before the fresh page',()=>{
 const f=fixture();f.win.location.pathname='/gestion/direccion';f.dispatch(GTM_ROUTE_EVENT);
 assert.equal(f.reloads,1);assert.equal(f.scripts.length,0);
});

test('a blocked script can retry on an explicit event and disposal removes listeners',()=>{
 const f=fixture();f.scripts[0].onerror();assert.equal(f.scripts.length,0);
 f.dispatch('pageshow');assert.equal(f.scripts.length,1);
 f.dispose();f.values.clear();f.dispatch('storage',{key:METRICS_KEY});assert.equal(f.reloads,0);
});
