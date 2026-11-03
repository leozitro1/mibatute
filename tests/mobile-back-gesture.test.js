import test from 'node:test';
import assert from 'node:assert/strict';
import {attachMobileBackGesture,mobileBackAction} from '../src/components/mobileBackGesture.js';

function setup() {
  const handlers = new Map();
  let count = 0, scale = 1, available = true;
  const doc = {addEventListener:(name,fn) => handlers.set(name,fn),removeEventListener:(name,fn) => {assert.equal(handlers.get(name),fn);handlers.delete(name);}};
  const detach = attachMobileBackGesture(doc,() => available ? () => count++ : null,() => scale);
  const emit = (name,x,y=100,options={}) => {
    const touch = {clientX:x,clientY:y,identifier:1};
    let prevented = false;
    handlers.get(`touch${name}`)?.({target:{},touches:name === 'end' ? [] : [touch],changedTouches:[touch],timeStamp:name === 'start' ? 0 : 200,cancelable:true,preventDefault:() => {prevented=true;},...options});
    return prevented;
  };
  return {emit,detach,handlers,count:() => count,zoom:() => {scale=2;},disable:() => {available=false;}};
}

test('edge back completes once and cleans up all listeners',()=>{
  const s=setup();s.emit('start',20);assert.equal(s.emit('move',70),true);s.emit('end',120);s.emit('end',130);
  assert.equal(s.count(),1);s.detach();assert.equal(s.handlers.size,0);
});

test('ordinary scrolling, photos swipes away from edge, short, reverse, slow and cancelled gestures never go back',()=>{
  for (const scenario of [
    s=>{s.emit('start',90);s.emit('end',200);},
    s=>{s.emit('start',10);s.emit('move',20,140);s.emit('end',150);},
    s=>{s.emit('start',10);s.emit('end',60);},
    s=>{s.emit('start',20);s.emit('move',0);s.emit('end',130);},
    s=>{s.emit('start',10);s.emit('end',130,100,{timeStamp:1100});},
    s=>{s.emit('start',10);s.emit('cancel',100);s.emit('end',130);},
    s=>{s.emit('start',10);s.emit('move',100,100,{touches:[{},{}]});s.emit('end',130);},
    s=>{s.zoom();s.emit('start',10);s.emit('end',130);},
    s=>{s.emit('start',10);s.zoom();s.emit('end',130);},
    s=>{s.disable();s.emit('start',10);s.emit('end',130);},
    s=>{s.emit('start',10);s.disable();s.emit('end',130);},
  ]) {const s=setup();scenario(s);assert.equal(s.count(),0);s.detach();}
});

test('surface resolution closes only opted-in dialogs and protects drafts, forms and controls',()=>{
  let closed=0;
  const close={click:()=>closed++,disabled:false};
  let modal=null,excluded=false,blocked=false,form=false,focused=false,otherModal=false;
  const surface={matches:()=>blocked,querySelector:selector=>selector === 'form' ? form : close};
  const target={closest:selector=>selector === 'dialog, [role="dialog"]' ? modal : excluded};
  const doc={activeElement:{matches:()=>focused},querySelector:()=>otherModal};
  const back=()=>{};
  assert.equal(mobileBackAction(target,doc,back),back);
  modal=surface;mobileBackAction(target,doc,back)();assert.equal(closed,1);
  for (const flag of ['blocked','form','focused','excluded','disabled']) {
    blocked=flag==='blocked';form=flag==='form';focused=flag==='focused';excluded=flag==='excluded';close.disabled=flag==='disabled';
    assert.equal(mobileBackAction(target,doc,back),null);
  }
  blocked=form=focused=excluded=close.disabled=false;
  modal=null;otherModal=true;assert.equal(mobileBackAction(target,doc,back),null);
  modal={matches:()=>false,querySelector:()=>null};assert.equal(mobileBackAction(target,doc,back),null);
});
