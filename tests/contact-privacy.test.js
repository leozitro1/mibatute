import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CONTACT_EMAIL } from '../src/config/availability.js';
import { contactTextParts, publicContactText } from '../src/components/contactText.js';

test('contact uses the confirmed mailbox and legacy system contact addresses are hidden without changing other people’s addresses', async () => {
  assert.equal(CONTACT_EMAIL, ['info', 'mibatute.com'].join('@'));
  const migration = await readFile(new URL('../supabase/migrations/2026-10-19-temporary-contact-email.sql', import.meta.url), 'utf8');
  const legacy = migration.match(/'([^']+@gmail\.com)'/)[1];
  for (const address of [legacy, CONTACT_EMAIL, ['hola', 'mibatute.com'].join('@')]) {
    const text = `Solicita ayuda escribiendo a ${address}.`;
    const parts = contactTextParts(text);
    assert.equal(parts.filter(part => part.contact).length, 1);
    assert.equal(publicContactText(text).includes(address), false);
    assert.ok(publicContactText(text).endsWith('.'));
  }
  const personal = 'El correo de tu cuenta es persona@example.com.';
  assert.equal(publicContactText(personal), personal);
  assert.equal(contactTextParts('Consulta mediante el canal de contacto de MiBatute.').filter(part => part.contact).length, 1);
});
