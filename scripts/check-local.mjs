import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { queryMisRescates, isRescateVisible, canOpenRescateChat } from '../src/supabase/rescatesQuery.js';

const env = { ...process.env, PATH: `/Applications/Docker.app/Contents/Resources/bin:${process.env.PATH}` };
const status = JSON.parse(execFileSync('npx', ['--yes', 'supabase@2.119.0', 'status', '-o', 'json'], {
  env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
}));
assert.equal(new URL(status.API_URL).hostname, '127.0.0.1');
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const seller = createClient(status.API_URL, status.ANON_KEY, options);
const buyer = createClient(status.API_URL, status.ANON_KEY, options);
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, options);
const checked = ({ data, error }) => { assert.ifError(error); return data; };
let articleId;
let donationId;
let imagePath;
try {
  const sellerUser = checked(await seller.auth.signInWithPassword({ email: 'vendedor@example.com', password: '123456' })).user;
  const buyerUser = checked(await buyer.auth.signInWithPassword({ email: 'comprador@example.com', password: '123456' })).user;
  assert.ok(sellerUser.email_confirmed_at && buyerUser.email_confirmed_at);
  assert.ok(checked(await seller.from('usuarios').select('nombre').eq('id', sellerUser.id).single()).nombre);
  const article = checked(await seller.from('articulos').insert({
    owner_id: sellerUser.id, title: 'Verificacion temporal local', mode: 'venta', price: 1000,
    estado_producto: 8, status: 'disponible', estado: 'disponible',
  }).select('id').single());
  articleId = article.id;
  const reservation = checked(await buyer.rpc('transition_sale', { p_articulo_id: articleId, p_action: 'reserve' }));
  assert.equal(reservation.article.buyer_id, buyerUser.id);
  assert.equal(reservation.article.status, 'reservado');
  const chatId = reservation.chat.id;
  assert.equal(reservation.chat.status, 'pending');
  assert.ok((await buyer.from('chat_messages').insert({ chat_id: chatId, sender_id: buyerUser.id, body: 'No autorizado' })).error);
  assert.ok((await buyer.rpc('transition_sale', { p_articulo_id: articleId, p_action: 'approve_chat' })).error);
  assert.ok((await buyer.from('chats').update({ status: 'open' }).eq('id', chatId)).error);
  checked(await seller.rpc('transition_sale', { p_articulo_id: articleId, p_action: 'cancel' }));
  const rejected = checked(await queryMisRescates(buyer, buyerUser.id)).find(row => row.articulo_id === articleId);
  assert.ok(rejected);
  assert.equal(rejected._canceledBy, sellerUser.id);
  assert.equal(canOpenRescateChat(rejected, buyerUser.id, true), false);
  assert.equal(isRescateVisible(rejected, buyerUser.id, Date.parse(rejected._canceledAt) + 86400000), false);
  const newReservation = checked(await buyer.rpc('transition_sale', { p_articulo_id: articleId, p_action: 'reserve' }));
  assert.equal(newReservation.chat.canceled_at, null);
  assert.equal(newReservation.chat.status, 'pending');
  const approved = checked(await seller.rpc('transition_sale', { p_articulo_id: articleId, p_action: 'approve_chat' }));
  assert.equal(approved.chat.status, 'open');
  assert.ok(approved.chat.approved_at);
  assert.ok((await seller.rpc('transition_sale', { p_articulo_id: articleId, p_action: 'cancel' })).error);
  assert.ok((await buyer.rpc('transition_sale', { p_articulo_id: articleId, p_action: 'cancel' })).error);
  assert.ok((await buyer.from('chats').delete().eq('id', chatId)).error);
  assert.ok((await seller.from('articulos').delete().eq('id', articleId)).error);
  assert.ok((await seller.from('chats').delete().eq('id', chatId)).error);
  assert.ok((await seller.rpc('delete_article_deep', { p_articulo_id: articleId })).error);
  checked(await buyer.from('chat_messages').insert({ chat_id: chatId, sender_id: buyerUser.id, body: 'Mensaje de prueba local' }));
  assert.equal(checked(await seller.from('chat_messages').select('body').eq('chat_id', chatId)).length, 1);
  const delivered = checked(await seller.rpc('transition_sale', { p_articulo_id: articleId, p_action: 'deliver' }));
  assert.equal(delivered.article.status, 'entregado');
  assert.ok((await seller.from('articulos').delete().eq('id', articleId)).error);
  assert.equal(checked(await seller.from('chats').select('status').eq('id', chatId).single()).status, 'closed');
  assert.ok((await buyer.from('chat_messages').insert({ chat_id: chatId, sender_id: buyerUser.id, body: 'Fuera de plazo' })).error);
  console.log('Correcto: login, perfiles, reserva, chat y entrega con permisos reales.');

  donationId = checked(await seller.from('articulos').insert({ owner_id: sellerUser.id,
    title: 'Verificacion temporal de donacion', mode: 'donacion', estado_producto: 8,
    status: 'disponible', estado: 'disponible' }).select('id').single()).id;
  const application = checked(await buyer.from('postulaciones').insert({ articulo_id: donationId,
    usuario_id: buyerUser.id, justificacion: 'Para usarla en casa' }).select('id').single());
  assert.ok((await buyer.from('chats').insert({ articulo_id: donationId, buyer_id: buyerUser.id,
    seller_id: sellerUser.id, owner_id: sellerUser.id, status: 'open' })).error);
  checked(await seller.from('postulaciones').delete().eq('id', application.id));
  const rejectedDonation = checked(await queryMisRescates(buyer, buyerUser.id)).find(row => row.articulo_id === donationId);
  assert.equal(rejectedDonation._source, 'rechazadas');
  assert.equal(canOpenRescateChat(rejectedDonation, buyerUser.id, true), false);
  assert.ok((await buyer.from('postulaciones').insert({ articulo_id: donationId, usuario_id: buyerUser.id })).error);
  checked(await admin.from('postulaciones_rechazadas').update({ created_at: new Date(Date.now() - 86400000 - 1000).toISOString() })
    .eq('articulo_id', donationId).eq('usuario_id', buyerUser.id));
  checked(await buyer.from('postulaciones').insert({ articulo_id: donationId, usuario_id: buyerUser.id }));
  checked(await seller.from('articulos').update({ ganador_id: buyerUser.id, status: 'reservado', estado: 'reservado' }).eq('id', donationId));
  const donationChat = checked(await buyer.from('chats').select('id,status').eq('articulo_id', donationId).single());
  assert.equal(donationChat.status, 'open');
  checked(await buyer.from('chat_messages').insert({ chat_id: donationChat.id, sender_id: buyerUser.id, body: 'Gracias por aceptar' }));
  console.log('Correcto: rechazo de donacion, bloqueo de 24 horas y chat solo al aceptar.');

  const fixture = checked(await seller.from('articulo_imagenes').select('path,url').eq('owner_id', sellerUser.id).limit(1));
  assert.ok(fixture[0]);
  const photo = await fetch(fixture[0].url);
  assert.equal(photo.status, 200);
  imagePath = `mibatute/articulos/${sellerUser.id}/check-${crypto.randomUUID()}.jpg`;
  checked(await seller.storage.from('local-images').upload(imagePath, new Uint8Array(await photo.arrayBuffer()), { contentType: 'image/jpeg' }));
  await buyer.storage.from('local-images').remove([imagePath]);
  checked(await seller.storage.from('local-images').download(imagePath));
  const foreignUpload = await buyer.storage.from('local-images').upload(
    `mibatute/articulos/${sellerUser.id}/foreign-${crypto.randomUUID()}.jpg`, new Uint8Array([1]), { contentType: 'image/jpeg' },
  );
  assert.ok(foreignUpload.error, 'Otro usuario no debe subir fotos a la carpeta del vendedor.');
  checked(await seller.storage.from('local-images').remove([imagePath]));
  assert.ok((await seller.storage.from('local-images').download(imagePath)).error);
  imagePath = null;
  console.log('Correcto: fotos locales visibles y gestionadas solo por su propietario.');
  checked(await buyer.auth.resetPasswordForEmail('comprador@example.com', {
    redirectTo: 'http://127.0.0.1:5173/auth/callback',
  }));
  let captured = false;
  for (let attempt = 0; attempt < 10; attempt++) {
    const mailbox = await (await fetch('http://127.0.0.1:54324/api/v1/messages')).json();
    captured = mailbox.messages.some(message => message.Subject === 'Recupera tu acceso a MiBatute'
      && message.To.some(recipient => recipient.Address === 'comprador@example.com'));
    if (captured) break;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.ok(captured, 'El correo de recuperacion debe llegar al buzon local con la plantilla de MiBatute.');
  console.log('Correcto: recuperacion de cuenta capturada en el buzon local, sin enviar correo real.');
} finally {
  if (imagePath) checked(await admin.storage.from('local-images').remove([imagePath]));
  if (articleId) checked(await admin.from('articulos').delete().eq('id', articleId));
  if (donationId) checked(await admin.from('articulos').delete().eq('id', donationId));
  await seller.auth.signOut({ scope: 'local' });
  await buyer.auth.signOut({ scope: 'local' });
}
