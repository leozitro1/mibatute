import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NOTIFICATION_HISTORY_LIMIT,
  readNotificationHistory,
  mergeNotificationHistory,
  writeNotificationHistory,
  markNotificationHistoryRead,
} from '../src/components/notificationHistory.js';

const at = (second) => new Date(Date.UTC(2026, 9, 8, 12, 0, second)).toISOString();
const notification = (id, second = 0, extra = {}) => ({
  id, type: 'chat', chat_id: 42, created_at: at(second),
  title: 'Mensaje nuevo', subtitle: 'En tu articulo', thumb: '/thumb.jpg',
  unreadCount: 3, ...extra,
});
const memoryStorage = () => {
  const entries = new Map();
  return {
    entries,
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, value),
  };
};

test('history evicts oldest groups at ten and orders tied dates by ID', () => {
  assert.equal(NOTIFICATION_HISTORY_LIMIT, 10);
  const items = Array.from({ length: 12 }, (_, i) => notification(`chat-${i}`, i));
  const result = mergeNotificationHistory([], items.reverse());
  assert.equal(result.length, 10);
  assert.deepEqual(result.map((item) => item.id),
    Array.from({ length: 10 }, (_, i) => `chat-${11 - i}`));
  const tied = [notification('z'), notification('a'), notification('m')];
  assert.deepEqual(mergeNotificationHistory([], tied).map((item) => item.id), ['a', 'm', 'z']);
  assert.deepEqual(mergeNotificationHistory([], tied.reverse()).map((item) => item.id), ['a', 'm', 'z']);
});

test('same event stays read; newer event in same group is unread unless incoming is seen', () => {
  const previous = [notification('chat-42', 1, { read: true })];
  const same = mergeNotificationHistory(previous, [notification('chat-42', 1)]);
  assert.equal(same[0].read, true);
  assert.equal(same[0].unreadCount, 0);
  const newer = mergeNotificationHistory(previous, [notification('chat-42', 2)]);
  assert.equal(newer.length, 1);
  assert.equal(newer[0].created_at, at(2));
  assert.equal(newer[0].read, false);
  assert.equal(newer[0].unreadCount, 3);
  const seen = mergeNotificationHistory(previous, [notification('chat-42', 2, { read: true })]);
  assert.equal(seen[0].read, true);
  assert.equal(seen[0].unreadCount, 0);
  assert.equal(previous[0].unreadCount, 3);
});

test('removed source groups remain and stale incoming cannot replace newer events', () => {
  const previous = [notification('retained', 3), notification('updated', 2)];
  const result = mergeNotificationHistory(previous, [notification('updated', 1, { read: true })]);
  assert.deepEqual(result.map((item) => item.id), ['retained', 'updated']);
  assert.equal(result[1].created_at, at(2));
  assert.equal(result[1].read, false);
  assert.deepEqual(mergeNotificationHistory(previous, undefined), result);
  assert.deepEqual(mergeNotificationHistory(previous, []), result);
});

test('duplicate groups use most recent timestamp regardless of source order', () => {
  const result = mergeNotificationHistory([], [notification('a', 4), notification('a', 1)]);
  assert.equal(result.length, 1);
  assert.equal(result[0].created_at, at(4));
  const equivalent = notification('a', 4, { read: true });
  equivalent.created_at = '2026-10-08T07:00:04-05:00';
  assert.equal(mergeNotificationHistory([equivalent], result)[0].read, true);
  const distant = notification('a', 0, { created_at: 253_402_300_799_999 });
  assert.equal(mergeNotificationHistory([distant], result)[0].created_at,
    '9999-12-31T23:59:59.999Z');
  assert.equal(mergeNotificationHistory([], mergeNotificationHistory([distant], result)).length, 1);
});

test('mark read uses exact ID, typed chat/article selectors and an inclusive cutoff without deleting', () => {
  const items = [
    notification('chat-old', 1), notification('chat-new', 3),
    notification('post', 2, { type: 'postulacion', articulo_id: 7 }),
    notification('other', 2, { type: 'info', articulo_id: 7 }),
  ];
  const chat = markNotificationHistoryRead(items, { chatId: '42', through: at(1) });
  assert.equal(chat.length, 4);
  assert.deepEqual(chat.filter((item) => item.read).map((item) => item.id), ['chat-old']);
  assert.equal(chat.find((item) => item.id === 'chat-old').unreadCount, 0);
  assert.equal(chat.find((item) => item.id === 'chat-new').unreadCount, 3);
  const article = markNotificationHistoryRead(items, { articleId: '7', through: at(2) });
  assert.deepEqual(article.filter((item) => item.read).map((item) => item.id), ['post']);
  const exact = markNotificationHistoryRead(items, { id: 'other', through: at(2) });
  assert.deepEqual(exact.filter((item) => item.read).map((item) => item.id), ['other']);
  assert.equal(markNotificationHistoryRead(items, { id: 'chat', through: at(5) }).some((item) => item.read), false);
  assert.equal(markNotificationHistoryRead(items, { chatId: 42, through: 'bad' }).some((item) => item.read), false);
  assert.equal(markNotificationHistoryRead(items).some((item) => item.read), false);
  assert.equal(items.some((item) => item.read), false);
});

test('default cutoff is now and marking keeps the limit, order and unrelated counts', () => {
  const now = Date.now();
  const items = Array.from({ length: 12 }, (_, i) => notification(`chat-${i}`, i, {
    created_at: now - i * 1_000,
  }));
  items.unshift(notification('future', 0, { created_at: now + 60_000 }));
  const result = markNotificationHistoryRead(items, { chatId: 42 });
  assert.equal(result.length, 10);
  assert.equal(result[0].id, 'future');
  assert.equal(result[0].read, false);
  assert.equal(result[0].unreadCount, 3);
  assert.ok(result.slice(1).every((item) => item.read && item.unreadCount === 0));
});

test('storage isolates users, persists only allowed fields and reads do not delete', () => {
  const storage = memoryStorage();
  const item = notification('chat-42', 1, {
    articulo_id: 7, buyer_id: 'buyer-1', read: false,
    body: 'private message', messages: ['private'], email: 'private@example.com',
    profile: { name: 'private' }, keys: ['secret'],
  });
  assert.equal(writeNotificationHistory(storage, 'user-a', [item]), true);
  assert.equal(writeNotificationHistory(storage, 'user-b', [notification('other', 2)]), true);
  assert.deepEqual(readNotificationHistory(storage, 'user-a').map((entry) => entry.id), ['chat-42']);
  assert.deepEqual(readNotificationHistory(storage, 'user-b').map((entry) => entry.id), ['other']);
  assert.deepEqual(readNotificationHistory(storage, 'missing'), []);
  const saved = JSON.parse(storage.entries.get('mb_notification_history_user-a'))[0];
  assert.deepEqual(Object.keys(saved).sort(), [
    'id', 'type', 'articulo_id', 'chat_id', 'buyer_id', 'created_at',
    'title', 'subtitle', 'thumb', 'read', 'unreadCount',
  ].sort());
  const before = [...storage.entries];
  readNotificationHistory(storage, 'user-a');
  assert.deepEqual([...storage.entries], before);
  const read = markNotificationHistoryRead([item], { id: item.id, through: at(1) });
  writeNotificationHistory(storage, 'user-a', read);
  assert.equal(readNotificationHistory(storage, 'user-a')[0].read, true);
});

test('corrupt JSON, invalid containers, oversized storage and storage failures are safe', () => {
  const storage = memoryStorage();
  for (const raw of ['{broken', 'null', '{}', '42', '"text"', ' '.repeat(65_537)]) {
    storage.setItem('mb_notification_history_user', raw);
    assert.deepEqual(readNotificationHistory(storage, 'user'), []);
  }
  const broken = {
    getItem() { throw new Error('denied'); },
    setItem() { throw new Error('quota'); },
  };
  assert.deepEqual(readNotificationHistory(broken, 'user'), []);
  assert.equal(writeNotificationHistory(broken, 'user', [notification('a')]), false);
  assert.deepEqual(readNotificationHistory(null, 'user'), []);
  assert.equal(writeNotificationHistory(null, 'user', []), false);
});

test('invalid types, timestamps, identifiers and oversized strings are rejected', () => {
  const invalid = [null, [], 'item', 3, new Date(),
    ...['', '__proto__', 'constructor', 'prototype', 'a/b', 'x'.repeat(201), {}, NaN]
      .map((id) => notification(id)),
    ...['bad', '2026-02-30T12:00:00Z', '2026-13-01T12:00:00Z',
      '2026-10-08T24:00:00Z', '2026-10-08T12:00:00+25:00', '2026-10-08',
      null, -1, Infinity, {}, true].map((created_at) => notification('a', 0, { created_at })),
    ...[{ type: {} }, { type: '__proto__' }, { read: 'true' }, { unreadCount: -1 },
      { unreadCount: 1.5 }, { unreadCount: 1_000_001 }, { chat_id: {} },
      { buyer_id: '__proto__' }, { title: {} }, { title: 'x'.repeat(513) },
      { subtitle: 'x'.repeat(1_025) }, { thumb: 'x'.repeat(2_049) }]
      .map((extra) => notification('a', 0, extra)),
  ];
  assert.deepEqual(mergeNotificationHistory(invalid, []), []);
  const storage = memoryStorage();
  for (const uid of [undefined, null, {}, '__proto__', '', 'a/b']) {
    assert.equal(writeNotificationHistory(storage, uid, []), false);
    assert.deepEqual(readNotificationHistory(storage, uid), []);
  }
  assert.equal(storage.entries.size, 0);
});

test('prototype keys are never copied and sanitized persistence remains bounded', () => {
  const polluted = JSON.parse(JSON.stringify(notification('safe')).replace(
    '"id":"safe"', '"__proto__":{"polluted":true},"constructor":{"secret":true},"id":"safe"',
  ));
  const storage = memoryStorage();
  const items = Array.from({ length: 15 }, (_, i) => notification(`chat-${i}`, i));
  assert.equal(writeNotificationHistory(storage, 'user', [...items, polluted]), true);
  assert.equal(readNotificationHistory(storage, 'user').length, 10);
  const result = mergeNotificationHistory([], [polluted])[0];
  assert.equal(Object.hasOwn(result, '__proto__'), false);
  assert.equal(Object.hasOwn(result, 'constructor'), false);
  assert.equal({}.polluted, undefined);
});
