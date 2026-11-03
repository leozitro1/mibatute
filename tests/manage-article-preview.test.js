import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';

test('publication management shows the public detail and keeps sale/donation controls in a single dialog',async()=>{
 const server=await createServer({server:{middlewareMode:true},appType:'custom',logLevel:'silent'});
 try{
  const {default:ManageArticleModal}=await server.ssrLoadModule('/src/components/ManageArticleModal.jsx');
  const article={id:'preview-article',owner_id:'owner',title:'Mesa de madera',description:'Descripción completa de la mesa',city:'Bogotá',locality:'Fontibón',location_reference:'Cerca a Hayuelos',status:'disponible',estado:'disponible',mode:'venta',price:25000,estado_producto:8,imagenes:['https://example.com/cover.jpg','https://example.com/second.jpg'],created_at:new Date().toISOString()};
  const render=patch=>renderToStaticMarkup(createElement(ManageArticleModal,{isOpen:true,article:{...article,...patch},user:{id:'owner'},onClose:()=>{}}));
  const sale=render({});
  for(const text of ['Mesa de madera','Descripción completa de la mesa','Fontibón','Cerca a Hayuelos','cover.jpg','second.jpg','Reserva de la venta','Este artículo aún no está reservado.'])assert.ok(sale.includes(text),text);
  assert.equal((sale.match(/role="dialog"/g)||[]).length,1);
  assert.ok(!sale.includes('Reserva primero y coordina el pago'));
  const reserved=render({status:'reservado',estado:'reservado',buyer_id:'buyer',transaction_chat:{status:'open'}});
  for(const text of ['Marcar entregado','Abrir chat','Reserva'])assert.ok(reserved.includes(text),text);
  const donation=render({mode:'donacion',price:0});
  assert.ok(donation.includes('Postulaciones'));
  assert.ok(donation.includes('Descripción completa de la mesa'));
  const selected=render({mode:'donacion',price:0,status:'reservado',estado:'reservado',ganador_id:'recipient'});
  for(const action of ['donation-action-chat','donation-action-deliver','donation-action-cancel'])assert.ok(selected.includes(action));
  assert.ok(selected.includes('Reservado para entrega'));
  const delivered=render({mode:'donacion',price:0,status:'entregado',estado:'entregado',ganador_id:'recipient'});
  assert.ok(delivered.includes('donation-action-chat'));
  assert.ok(!delivered.includes('donation-action-deliver'));
  assert.ok(!delivered.includes('donation-action-cancel'));
  const {default:ProductDetail}=await server.ssrLoadModule('/src/components/ProductDetail.jsx');
  const publicDetail=renderToStaticMarkup(createElement(ProductDetail,{isOpen:true,item:article,user:{id:'buyer'},onClose:()=>{}}));
  assert.ok(publicDetail.includes('Reserva primero y coordina el pago'));
  assert.ok(!publicDetail.includes('data-management-body'));
  assert.ok(!publicDetail.includes('Marcar entregado'));
  const {default:RescateArticleDetail}=await server.ssrLoadModule('/src/components/RescateArticleDetail.jsx');
  for(const mode of ['venta','donacion']) {
   const request=renderToStaticMarkup(createElement(RescateArticleDetail,{row:{articulo:{...article,mode}},user:{id:'buyer'},onClose:()=>{},actions:createElement('button',null,'Acción de la solicitud')}));
   assert.ok(request.includes(mode==='venta'?'Solicitud de compra enviada':'Solicitud de donación enviada'));
   assert.ok(request.includes('Descripción completa de la mesa'));
   assert.ok(request.includes('Acción de la solicitud'));
   assert.ok(!request.includes('Reserva primero y coordina el pago'));
   assert.ok(!request.includes('<textarea'));
   assert.equal((request.match(/role="dialog"/g)||[]).length,1);
  }
 }finally{await server.close();}
});
