import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PROFILE_FILTERS, filterProfileItems, canRateProfileArticle } from '../src/components/profileFilters.js';

const filters = changes => ({ ...DEFAULT_PROFILE_FILTERS, ...changes });
const articles = [
  { id: 'a', titulo: 'Bicicleta eléctrica', mode: 'venta', tipo: '', estado: 'reservado', created_at: '2026-09-01' },
  { id: 'b', titulo: 'Libros de regalo', mode: 'donacion', estado: 'disponible', is_featured: true, created_at: '2026-09-02' },
  { id: 'c', titulo: 'Mesa para regalar', mode: 'donacion', estado: 'reservado', ganador_id: 'buyer', created_at: '2026-09-03' },
];
const ids = rows => rows.map(row => row.id);

test('pending ratings stay pinned and rated deliveries go last for every sort', () => {
  const rows = [
    { id: 'rated', mode: 'venta', estado: 'entregado', buyer_id: 'buyer', created_at: '2026-10-01' },
    ...articles,
    { id: 'pending', mode: 'donacion', estado: 'entregado', ganador_id: 'buyer', created_at: '2026-01-01' },
  ];
  for (const sort of ['priority', 'newest', 'oldest']) {
    const ordered = ids(filterProfileItems(rows, filters({ sort }), { rated: new Set(['rated']) }));
    assert.equal(ordered[0], 'pending');
    assert.equal(ordered.at(-1), 'rated');
    const afterRating = ids(filterProfileItems(rows, filters({ sort }), { rated: new Set(['rated', 'pending']) }));
    assert.ok(afterRating.slice(-2).includes('pending'));
  }
});

test('only the recipient can have a pending rescue rating, never rejected applicants', () => {
  const gift = { id: 'gift', mode: 'donacion', estado: 'entregado', ganador_id: 'winner', owner_id: 'donor' };
  assert.equal(canRateProfileArticle(gift), true);
  assert.equal(canRateProfileArticle(gift, { rescates: true, userId: 'winner' }), true);
  assert.equal(canRateProfileArticle(gift, { rescates: true, userId: 'other' }), false);
  assert.equal(canRateProfileArticle({ ...gift, estado: 'reservado' }), false);
  const rows = [{ id: 'active', articulo: articles[0] }, { id: 'gift-row', articulo: gift }];
  assert.deepEqual(ids(filterProfileItems(rows, filters({}), { rescates: true, userId: 'winner' })), ['gift-row', 'active']);
  assert.deepEqual(ids(filterProfileItems(rows, filters({}), { rescates: true, userId: 'other' })), ['active', 'gift-row']);
});

test('combines title, type, status and featured filters without mutating input', () => {
  const before = structuredClone(articles);
  assert.deepEqual(ids(filterProfileItems(articles, filters({ search: ' ELECTRICA ', type: 'venta', status: 'reservado' }))), ['a']);
  assert.deepEqual(ids(filterProfileItems(articles, filters({ type: 'donacion', featured: true }))), ['b']);
  assert.deepEqual(articles, before);
});

test('requests include gifts already assigned, pending requests exclude them and sales', () => {
  const options = { posts: new Map([['a', true], ['b', true], ['c', true]]) };
  assert.deepEqual(ids(filterProfileItems(articles, filters({ activity: 'requests' }), options)), ['c', 'b']);
  assert.deepEqual(ids(filterProfileItems(articles, filters({ activity: 'pending' }), options)), ['b']);
});

test('unread messages differ from simply having a chat', () => {
  const options = { chats: new Map([['a', true], ['c', true]]), unread: new Map([['c', true]]) };
  assert.deepEqual(ids(filterProfileItems(articles, filters({ activity: 'unread' }), options)), ['c']);
  assert.deepEqual(ids(filterProfileItems(articles, filters({ activity: 'chat' }), options)), ['c', 'a']);
});

test('uses latest status and explicit featured overrides', () => {
  const options = { overrides: new Map([['b', { estado: 'entregado', updated_at: '2026-10-01' }]]), featured: { a: true, b: false } };
  assert.deepEqual(ids(filterProfileItems(articles, filters({ status: 'entregado' }), options)), ['b']);
  assert.deepEqual(ids(filterProfileItems(articles, filters({ featured: true }), options)), ['a']);
});

test('priority puts unread before reservations and requests; date ordering is selectable and stable', () => {
  const options = { unread: new Map([['b', true]]) };
  assert.deepEqual(ids(filterProfileItems(articles, filters({}), options)), ['b', 'c', 'a']);
  assert.deepEqual(ids(filterProfileItems(articles, filters({ sort: 'oldest' }), options)), ['a', 'b', 'c']);
  const tied = [{ id: 'x' }, { id: 'y' }];
  assert.deepEqual(ids(filterProfileItems(tied, filters({}))), ['x', 'y']);
});

test('rescue requests preserve metadata and separate pending from closed or assigned gifts', () => {
  const rows = [
    { id: 'r1', articulo: articles[1], _source: 'postulaciones' },
    { id: 'r2', articulo: articles[2], _source: 'chats', _chatId: 'chat2' },
    { id: 'r3', articulo: { ...articles[1], id: 'd' }, _source: 'chats', _chatStatus: 'closed' },
    { id: 'r4', articulo: articles[0], _source: 'compras' },
  ];
  const options = { rescates: true };
  assert.deepEqual(ids(filterProfileItems(rows, filters({ activity: 'requests' }), options)), ['r2', 'r1', 'r3']);
  const pending = filterProfileItems(rows, filters({ status: 'pendiente' }), options);
  assert.deepEqual(ids(pending), ['r1']);
  assert.equal(pending[0]._source, 'postulaciones');
  assert.deepEqual(ids(filterProfileItems(rows, filters({ activity: 'chat' }), options)), ['r2']);
});
