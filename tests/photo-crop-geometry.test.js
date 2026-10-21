import test from 'node:test';
import assert from 'node:assert/strict';
import { photoFitZoom,photoCropDrawRect } from '../src/components/photoCropGeometry.js';

test('fit zoom shows the whole landscape, portrait and square image inside the crop',()=>{
 assert.equal(photoFitZoom({width:600,height:300},{width:300,height:300}),.5);
 assert.equal(photoFitZoom({width:300,height:900},{width:300,height:300}),1/3);
 assert.equal(photoFitZoom({width:300,height:300},{width:300,height:300}),1);
 assert.equal(photoFitZoom(null,{width:300,height:300}),null);
 assert.equal(photoFitZoom({width:0,height:300},{width:300,height:300}),null);
});
test('zoomed-out exports preserve every source pixel and center the margins instead of stretching the photo',()=>{
 assert.deepEqual(photoCropDrawRect({width:1600,height:400},{x:0,y:-600,width:1600,height:1600},800),[0,0,1600,400,0,300,800,200]);
 assert.deepEqual(photoCropDrawRect({width:400,height:1600},{x:-600,y:0,width:1600,height:1600},800),[0,0,400,1600,300,0,200,800]);
 assert.deepEqual(photoCropDrawRect({width:1000,height:1000},{x:100,y:100,width:600,height:600},800),[100,100,600,600,0,0,800,800]);
 assert.deepEqual(photoCropDrawRect({width:1000,height:1000},{x:-100,y:100,width:500,height:500},800),[0,100,400,500,160,0,640,800]);
 assert.throws(()=>photoCropDrawRect({width:1000,height:1000},{x:1500,y:0,width:500,height:500},800),/dentro del encuadre/);
 assert.throws(()=>photoCropDrawRect({width:1000,height:1000},{x:0,y:0,width:0,height:500},800),/encuadre/);
});
