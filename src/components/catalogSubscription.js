// The public catalog is advisory; private notifications and chat use other channels.
export function subscribeVisibleCatalog(client, { topic, onChange, onReconnect, document: page = document }) {
  let channel = null, stopped = false, connectedBefore = false, removing = false;
  const join = () => {
    if (stopped || channel || removing || page.visibilityState === 'hidden') return;
    const current = client.channel(topic);
    channel = current;
    current.on('broadcast', { event: 'catalog_changed' }, ({ payload }) => {
      if (!stopped && channel === current && page.visibilityState !== 'hidden') onChange(payload);
    }).subscribe(status => {
      if (stopped || channel !== current || status !== 'SUBSCRIBED') return;
      if (connectedBefore) onReconnect();
      connectedBefore = true;
    });
  };
  const visibility = () => {
    if (page.visibilityState === 'hidden') {
      const previous = channel;
      channel = null;
      if (previous) {
        removing = true;
        Promise.resolve(client.removeChannel(previous)).catch(() => {}).finally(() => { removing = false; join(); });
      }
    } else join();
  };
  page.addEventListener('visibilitychange', visibility);
  join();
  return () => {
    stopped = true;
    page.removeEventListener('visibilitychange', visibility);
    const previous = channel;
    channel = null;
    if (previous) client.removeChannel(previous);
  };
}
