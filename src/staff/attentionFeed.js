import { ATTENTION_SECTIONS } from './attention.js';

// A single private channel and a coalesced summary query. No polling or keepalive.
export function createAttentionFeed({ client, userId, onSnapshot, onAccessExpired,
  visibility = document, clock = {
    setTimeout: (callback, delay) => setTimeout(callback, delay),
    clearTimeout: timer => clearTimeout(timer),
  } }) {
  let alive = true, timer, channel, inFlight = false, dirty = true, connectionError = false;
  let counts = null;
  const revisions = {}, sections = new Set();
  const emit = status => { if (alive) onSnapshot({ userId, counts, revisions: { ...revisions }, status }); };
  const visible = () => visibility.visibilityState === 'visible';
  const schedule = (section, refreshList = false) => {
    if (!alive) return;
    dirty = true;
    if (refreshList && ATTENTION_SECTIONS.some(item => item.id === section)) sections.add(section);
    if (!timer && !inFlight && visible()) timer = clock.setTimeout(flush, 350);
  };
  async function flush() {
    timer = undefined;
    if (!alive || !visible() || inFlight || !dirty) return;
    inFlight = true; dirty = false;
    const changed = [...sections]; sections.clear();
    try {
      const { data, error } = await client.rpc('staff_attention_summary');
      if (error) throw error;
      if (!data || !ATTENTION_SECTIONS.every(item => Number.isInteger(data[item.id]) && data[item.id] >= 0)) throw new Error('No se pudo confirmar el conteo de avisos.');
      if (alive) {
        counts = data;
        for (const section of changed) revisions[section] = (revisions[section] || 0) + 1;
        emit(connectionError ? 'error' : 'ready');
      }
    } catch (error) {
      if (alive) {
        for (const section of changed) sections.add(section);
        emit('error');
        if (error.code === '42501') onAccessExpired?.();
      }
    } finally {
      inFlight = false;
      if (alive && dirty && visible()) timer = clock.setTimeout(flush, 350);
    }
  }
  const visibilityChanged = () => { if (visible() && dirty) schedule(); };
  visibility.addEventListener('visibilitychange', visibilityChanged);
  schedule();
  Promise.resolve(client.realtime.setAuth()).then(() => {
    if (!alive) return;
    channel = client.channel('mb:support:staff', { config: { private: true } })
      .on('broadcast', { event: 'staff_attention_changed' }, event => {
        const payload = event.payload;
        if (!ATTENTION_SECTIONS.some(item => item.id === payload?.section)) return;
        if (payload?.staff_id && payload.staff_id !== userId) return;
        schedule(payload?.section, payload?.refresh_list !== false);
      }).subscribe(status => {
        if (!alive) return;
        if (status === 'SUBSCRIBED') {
          connectionError = false;
          for (const item of ATTENTION_SECTIONS) sections.add(item.id);
          schedule();
        } else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) { connectionError = true; emit('error'); }
      });
  }).catch(() => { if (alive) { connectionError = true; emit('error'); } });
  return {
    refresh: () => schedule(),
    stop: () => {
      alive = false; clock.clearTimeout(timer);
      visibility.removeEventListener('visibilitychange', visibilityChanged);
      if (channel) client.removeChannel(channel);
    },
  };
}
