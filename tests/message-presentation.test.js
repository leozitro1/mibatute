import test from 'node:test';
import assert from 'node:assert/strict';
import { messageSections } from '../src/components/messagePresentation.js';

test('notice separates payment paragraphs and metadata without changing amounts or references', () => {
  assert.deepEqual(messageSections('Se abonaron 3 créditos a tu cuenta. Total pagado: 7000.00 COP. Referencia: MB-123. Consulta tu saldo.'), [
    { text: 'Se abonaron 3 créditos a tu cuenta.' },
    { label: 'Total pagado', text: '7000.00 COP.' },
    { label: 'Referencia', text: 'MB-123.' },
    { text: 'Consulta tu saldo.' },
  ]);
});

test('manual notices preserve URLs, contact addresses and plain text markup', () => {
  const content = 'Revisa https://example.com/a.jpg o escribe a info@mibatute.com.\n\nMotivo: Ajuste solicitado\n<script>alert(1)</script>';
  assert.deepEqual(messageSections(content), [
    { text: 'Revisa https://example.com/a.jpg o escribe a info@mibatute.com.' },
    { label: 'Motivo', text: 'Ajuste solicitado' },
    { text: '<script>alert(1)</script>' },
  ]);
  assert.deepEqual(messageSections(null), []);
});
