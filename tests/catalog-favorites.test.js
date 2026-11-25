import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanCatalogFavorites,favoriteLifecycle,isFavoriteFinished} from '../src/components/catalogFavorites.js';
const now=Date.parse('2026-11-25T12:00:00Z');
const article=(id,extra={})=>({id,status:'disponible',created_at:'2026-11-01T12:00:00Z',updated_at:'2026-11-25T10:00:00Z',...extra});
const favorite=id=>({id,title:`Title ${id}`,image:'saved-image',location:'Bogotá'});

test('confirmed expired and completed articles leave favorites while reservations stay',()=>{
 const favorites=['delivered','sold','expired','aged','renewed-expired','reserved','available','unknown'].map(favorite);
 const rows=[article('delivered',{estado:'entregado'}),article('sold',{status:'sold'}),article('expired',{status:'vencido'}),
  article('aged',{created_at:'2026-08-01T12:00:00Z'}),article('renewed-expired',{publication_expires_at:'2026-11-25T12:00:00Z'}),
  article('reserved',{status:'reserved',created_at:'2026-08-01T12:00:00Z',catalog_hide_at:'2026-11-24T12:00:00Z'}),article('available')];
 assert.deepEqual(cleanCatalogFavorites(favorites,rows,now).map(item=>item.id),['reserved','available','unknown']);
 assert.equal(favorites.length,8,'Original browser state is not mutated');
 assert.equal(isFavoriteFinished(article('new'),now),false);
});

test('missing page data never removes a favorite and metadata updates settle without a render loop',()=>{
 const favorites=[favorite('outside-page'),favorite('loaded')];
 assert.equal(cleanCatalogFavorites(favorites,[],now),favorites);
 const enriched=cleanCatalogFavorites(favorites,[article('loaded')],now);
 assert.equal(enriched[0],favorites[0]);assert.equal(enriched[1].title,favorites[1].title);
 assert.equal(enriched[1].image,'saved-image');
 assert.equal(cleanCatalogFavorites(enriched,[article('loaded')],now),enriched);
 assert.equal(cleanCatalogFavorites(enriched,[],now),enriched);
});

test('stored known deadlines free slots at expiry without requiring another catalogue request',()=>{
 const source=article('a',{publication_expires_at:'2026-11-25T12:00:00Z'});
 const favorites=[{...favorite('a'),lifecycle:favoriteLifecycle(source)},favorite('legacy-without-date')];
 assert.equal(cleanCatalogFavorites(favorites,[],now-1),favorites);
 assert.deepEqual(cleanCatalogFavorites(favorites,[],now).map(item=>item.id),['legacy-without-date']);
});

test('a confirmed republication overrides an old deadline and stale cached pages cannot undo it',()=>{
 const old=article('a',{publication_expires_at:'2026-11-25T11:00:00Z',updated_at:'2026-11-24T12:00:00Z'});
 const renewed=article('a',{publication_expires_at:'2026-12-25T12:00:00Z'});
 const saved=[{...favorite('a'),lifecycle:favoriteLifecycle(old)}];
 const refreshed=cleanCatalogFavorites(saved,[renewed],now);
 assert.equal(refreshed.length,1);assert.equal(refreshed[0].lifecycle.publication_expires_at,renewed.publication_expires_at);
 assert.equal(cleanCatalogFavorites(refreshed,[old],now),refreshed);
 assert.equal(cleanCatalogFavorites(saved,[old,renewed],now).length,1);
});

test('lifecycle snapshots keep only the fields needed for cleanup and apply status aliases consistently',()=>{
 assert.deepEqual(favoriteLifecycle(article('a',{title:'Private content',body:'message',price:50,publication_expires_at:null})),{
  status:'disponible',created_at:'2026-11-01T12:00:00Z',publication_expires_at:null,updated_at:'2026-11-25T10:00:00Z'});
 assert.equal(isFavoriteFinished(article('a',{status:' RESERVED ',created_at:'2026-08-01'}),now),false);
 assert.equal(isFavoriteFinished({estado:'VENDIDO'},now),true);
});
