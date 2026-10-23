import test from 'node:test';
import assert from 'node:assert/strict';
import {EMAIL_PREVIEWS,renderActivityEmail} from '../src/email/templates.js';

test('every transactional email has matching HTML and plain text, context-specific safety and a canonical destination',()=>{
 assert.equal(EMAIL_PREVIEWS.length,10);
 for(const example of EMAIL_PREVIEWS){
  const {subject,text,html}=renderActivityEmail(example);
  assert.equal(subject,`MiBatute · ${example.title}`);
  assert.ok(text.includes(example.detail));assert.ok(html.includes(example.detail));
  assert.match(text,/Tu seguridad primero/);assert.match(html,/Tu seguridad primero/);
  assert.match(html,/<html lang="es">/);assert.match(html,/max-width:600px/);
  const urls=[...html.matchAll(/href="([^"]+)"/g)].map(match=>match[1]);
  assert.deepEqual(urls,['https://www.mibatute.com/']);
  assert.doesNotMatch(html,/<script|<img|<iframe|<form|<link|@import|url\(/i);
 }
});
test('untrusted article text is escaped, never interpreted as markup, attributes or email header content',()=>{
 const {html,subject}=renderActivityEmail({kind:'published',title:'<img src=x onerror=alert(1)>\r\nBcc: victim',detail:'<a href="https://evil.example">&private</a>'});
 assert.doesNotMatch(html,/<img|onerror="|<a href="https:\/\/evil/);assert.match(html,/&lt;a href=&quot;https:\/\/evil/);
 assert.doesNotMatch(subject,/[\r\n]/);
 assert.ok(html.length<30000);
});
test('moderation explains recourse and sale templates do not present an email as proof of payment',()=>{
 assert.match(renderActivityEmail(EMAIL_PREVIEWS.find(item=>item.kind==='suspension')).text,/No necesitas pagar para pedir esa revisión/);
 assert.match(renderActivityEmail(EMAIL_PREVIEWS.find(item=>item.kind==='sale')).text,/no certifica el pago/);
 assert.match(renderActivityEmail(EMAIL_PREVIEWS.find(item=>item.kind==='request')).text,/verifica el dinero directamente en tu banco/);
});

test('publication highlights the individual price and credit notices distinguish awards from purchases',()=>{
 const published=renderActivityEmail(EMAIL_PREVIEWS.find(item=>item.kind==='published'));
 assert.match(published.text,/destacar tu publicación por solo \$2\.500 COP/);
 assert.match(published.html,/Es opcional y no garantiza/);
 const gift=renderActivityEmail(EMAIL_PREVIEWS.find(item=>item.kind==='credits_gift'));
 assert.match(gift.text,/No es una compra ni genera un cobro/);
 const purchase=renderActivityEmail(EMAIL_PREVIEWS.find(item=>item.kind==='credits_purchase'));
 assert.match(purchase.text,/Los créditos comprados no vencen/);assert.match(purchase.text,/MB-EJEMPLO/);
});
