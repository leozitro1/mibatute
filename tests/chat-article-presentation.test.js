import test from 'node:test';
import assert from 'node:assert/strict';
import {chatArticlePresentation} from '../src/components/chatArticlePresentation.js';

test('chat detail keeps the cover first, sorts saved photos and removes duplicates without mutating the article',()=>{
  const article={image_url:'cover.jpg',articulo_imagenes:[{url:'last.jpg',position:2},{url:'cover.jpg',position:0},{url:'second.jpg',position:1}],imagenes_db:[{url:'last.jpg'},{url:123},null]};
  assert.deepEqual(chatArticlePresentation(article).images,['cover.jpg','second.jpg','last.jpg']);
  assert.equal(article.articulo_imagenes[0].url,'last.jpg');
  assert.deepEqual(chatArticlePresentation({imagen_url_principal:' first.jpg ',imagenes:['first.jpg','other.jpg','']}).images,['first.jpg','other.jpg']);
});

test('chat detail displays reservation status, product condition and locality using existing field aliases',()=>{
  const view=chatArticlePresentation({status:'reserved',estado_producto:8,locality:'Chapinero',city:'Bogotá'});
  assert.equal(view.status,'Reservado');assert.equal(view.condition.label,'Buen estado');
  assert.equal(view.condition.score,8);assert.equal(view.locality,'Chapinero');assert.equal(view.city,'Bogotá');
  const legacy=chatArticlePresentation({estado:'entregado',estadoProducto:10,localidad_es:'Suba',ciudad:'Bogotá'});
  assert.equal(legacy.status,'Entregado');assert.equal(legacy.condition.label,'Nuevo');assert.equal(legacy.locality,'Suba');
  const empty=chatArticlePresentation(null);assert.deepEqual(empty.images,[]);assert.equal(empty.condition,null);assert.equal(empty.status,'No informado');
});
