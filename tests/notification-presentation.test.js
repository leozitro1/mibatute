import test from 'node:test';
import assert from 'node:assert/strict';
import { bellListItems, isBellUnread, sortBellNotifications, groupBellNotifications } from '../src/components/notificationPresentation.js';
import { markNotificationBellRead } from '../src/components/notificationHistory.js';

const item = (id, patch = {}) => ({ id, type: 'chat', created_at: '2026-11-06T12:00:00Z', read: false, unreadCount: 1, ...patch });

test('bell counts and filters agree after marking all while conversation unread state stays intact', () => {
  const items = [item('a', { unreadCount: 3 }), item('b', { read: true, unreadCount: 0 }), item('c', { bellRead: true })];
  assert.equal(items.filter(isBellUnread).length, 1);
  const marked = markNotificationBellRead(items, items.filter(isBellUnread));
  assert.equal(marked.filter(isBellUnread).length, 0);
  assert.equal(marked.find(entry => entry.id === 'a').unreadCount, 3);
  assert.equal(marked.find(entry => entry.id === 'a').read, false);
  const newer = item('new', { created_at: '2026-11-06T12:01:00Z' });
  assert.equal(markNotificationBellRead([newer], items).filter(isBellUnread).length, 1);
  assert.equal(isBellUnread(item('empty', { unreadCount: 0 })), false);
});

test('bell can expose available history beyond ten without mutating input and remains bounded', () => {
  const items = Array.from({ length: 305 }, (_, i) => item(`id-${i}`, { created_at: new Date(1760000000000 + i * 60000).toISOString() }));
  const before = [...items];
  const sorted = sortBellNotifications(items);
  assert.equal(sorted.length, 300);
  assert.equal(sorted[0].id, 'id-304');
  assert.equal(sorted[299].id, 'id-5');
  assert.deepEqual(items, before);
  assert.deepEqual(sortBellNotifications(null), []);
});

test('day sections use local midnight, including the exact boundary, and omit empty sections', () => {
  const now = new Date(2026, 10, 6, 12);
  const midnight = new Date(2026, 10, 6);
  const today = item('today', { created_at: midnight.toISOString() });
  const yesterday = item('yesterday', { created_at: new Date(midnight.getTime() - 1).toISOString() });
  assert.deepEqual(groupBellNotifications([today, yesterday], now), [
    { label: 'Hoy', items: [today] }, { label: 'Anteriores', items: [yesterday] },
  ]);
  assert.deepEqual(groupBellNotifications([yesterday], now), [{ label: 'Anteriores', items: [yesterday] }]);
  assert.deepEqual(groupBellNotifications([], now), []);
});

test('both bell filters stop at thirty without truncating the state used by counters', () => {
  const items = Array.from({ length: 100 }, (_, i) => item(`id-${i}`, { bellRead: i < 40 }));
  assert.equal(bellListItems(items).length, 30);
  const unread = bellListItems(items, true);
  assert.equal(unread.length, 30);
  assert.equal(unread[0].id, 'id-40');
  assert.equal(unread[29].id, 'id-69');
  assert.equal(items.filter(isBellUnread).length, 60);
  assert.equal(items.length, 100);
  assert.deepEqual(bellListItems([], true), []);
});
