import test from 'node:test';
import assert from 'node:assert/strict';
import { bogotaInput,bogotaIso,ctr,safeSponsorUrl,sponsorContext,sponsorCreative,sponsorCoverage } from '../src/sponsors/model.js';
import { createSponsorMetrics } from '../src/sponsors/metricsQueue.js';

test('sponsor URLs reject active content and credentials; scheduling uses Colombia regardless of device timezone',()=>{
  for(const url of ['javascript:alert(1)','data:text/html,x','https://user:pass@example.com/','http://example.com'])assert.equal(safeSponsorUrl(url),'');
  assert.equal(safeSponsorUrl('https://example.com'),'https://example.com/');
  assert.equal(safeSponsorUrl('http://127.0.0.1:54321/a',true),'http://127.0.0.1:54321/a');
  assert.equal(safeSponsorUrl('http://127.0.0.1:54321/a'),'');
  assert.equal(bogotaInput('2026-10-15T14:30:00Z'),'2026-10-15T09:30');
  assert.equal(bogotaIso('2026-10-15T09:30'),'2026-10-15T14:30:00.000Z');
  assert.equal(bogotaIso(''),null);assert.match(ctr(10,2),/^20,00\s?%$/);assert.match(ctr(0,0),/^0,00\s?%$/);
});
test('metrics batch only observed campaigns, deduplicate views and clicks and do no idle network work',async()=>{
  const calls=[],timers=new Map();let next=0;
  const queue=createSponsorMetrics({visit:'page-id',send:async(payload,keepalive)=>calls.push({payload,keepalive}),schedule:callback=>{timers.set(++next,callback);return next;},cancel:id=>timers.delete(id)});
  await queue.flush();assert.equal(calls.length,0);assert.equal(timers.size,0);
  queue.impression('one','hero');queue.impression('one','hero');queue.impression('two','footer');assert.equal(calls.length,0);assert.equal(timers.size,1);
  queue.click('one','hero');await queue.flush();
  assert.equal(calls.length,1);assert.equal(calls[0].payload.p_events.length,2);assert.equal(calls[0].payload.p_events[0].clicked,true);
  queue.click('one','hero');queue.impression('two','footer');await queue.flush();assert.equal(calls.length,1);assert.equal(timers.size,0);
  queue.click('two','footer');await queue.flush();assert.equal(calls.length,2);assert.equal(calls[1].payload.p_events.length,1);
});
test('metrics retries preserve the original page identifier and stop after three failures',async()=>{
  let calls=0;const timers=new Map();let id=0;
  const queue=createSponsorMetrics({visit:'same-page',send:async payload=>{calls++;assert.equal(payload.p_visit,'same-page');throw new Error('offline');},schedule:callback=>{timers.set(++id,callback);return id;},cancel:key=>timers.delete(key)});
  queue.impression('one','hero');await queue.flush(true);await queue.flush(true);await queue.flush(true);await queue.flush(true);
  assert.equal(calls,3);assert.equal(timers.size,0);
});
test('sponsor filters normalize all-options and galleries rotate without duplicating advertiser turns',()=>{
  assert.deepEqual(sponsorContext({city:'Bogotá',locality:'Todas',category:'Todo'}),{p_city:'Bogotá',p_locality:'',p_category:''});
  assert.deepEqual(sponsorContext({city:'Bogotá',locality:'Suba',category:'Mascotas'}),{p_city:'Bogotá',p_locality:'Suba',p_category:'Mascotas'});
  const campaign={id:'one',imagen_url:'primary',creative_assets:[{imagen_url:'first'},{imagen_url:'second'}]};
  assert.equal(sponsorCreative(campaign,0).imagen_url,'first');assert.equal(sponsorCreative(campaign,1).imagen_url,'second');assert.equal(sponsorCreative(campaign,2).imagen_url,'first');
  assert.equal(sponsorCreative(campaign,1).id,'one');assert.equal(sponsorCreative({id:'legacy',imagen_url:'old'},4).imagen_url,'old');
  assert.equal(sponsorCoverage({}),'Cobertura general · Todas las categorías');
  assert.equal(sponsorCoverage({target_locations:[{city:'Bogotá',locality:'Suba'}],target_categories:['Mascotas']}),'Bogotá / Suba · Mascotas');
});
