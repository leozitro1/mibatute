// Adds Presence to the message channel already owned by ChatMessenger.
// No polling, timers, database writes, last-seen timestamps or extra channels.
export function attachChatPresence(channel, {
  userId, peerId, onChange, documentTarget = document, windowTarget = window,
}) {
  let alive = true, connected = false, published = false, desired = false, pageShown = true;
  let epoch = 0, last = null, pending = Promise.resolve();
  const visible = () => pageShown && documentTarget.visibilityState === 'visible'
    && windowTarget.navigator?.onLine !== false;
  const notify = online => {
    if (alive && online !== last) { last = online; onChange(online); }
  };
  const sync = () => {
    if (!alive) return;
    if (!connected || !published || !visible()) return notify(false);
    const entries = Object.values(channel.presenceState()).flat();
    notify(entries.some(entry => entry.user_id === String(peerId) && entry.active === true));
  };
  const update = () => {
    if (!alive) return;
    const next = connected && visible();
    if (next !== desired) {
      desired = next;
      const generation = epoch;
      pending = pending.then(async () => {
        if (!alive || !connected || generation !== epoch || published === desired) return;
        const value = desired;
        const result = await (value ? channel.track({ user_id: String(userId), active: true }) : channel.untrack());
        if (!alive || generation !== epoch) return;
        if (result === 'ok') { published = value; sync(); }
        else notify(false);
      }).catch(() => notify(false));
    }
    sync();
  };
  const hide = () => { pageShown = false; update(); };
  const show = () => { pageShown = true; update(); };
  channel.on('presence', { event: 'sync' }, sync);
  documentTarget.addEventListener('visibilitychange', update);
  windowTarget.addEventListener('offline', update);
  windowTarget.addEventListener('online', update);
  windowTarget.addEventListener('pagehide', hide);
  windowTarget.addEventListener('pageshow', show);
  notify(false);
  return {
    status(status) {
      const joined = status === 'SUBSCRIBED';
      if (joined === connected) return;
      connected = joined; published = false; desired = false; epoch++;
      notify(false);
      if (joined) update();
    },
    settled: () => pending,
    dispose() {
      if (!alive) return;
      const shouldUntrack = connected && (published || desired);
      alive = false; epoch++;
      documentTarget.removeEventListener('visibilitychange', update);
      windowTarget.removeEventListener('offline', update);
      windowTarget.removeEventListener('online', update);
      windowTarget.removeEventListener('pagehide', hide);
      windowTarget.removeEventListener('pageshow', show);
      if (shouldUntrack) Promise.resolve(channel.untrack()).catch(() => {});
    },
  };
}
