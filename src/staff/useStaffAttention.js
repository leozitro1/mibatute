import { useEffect, useRef, useState } from 'react';
import { createAttentionFeed } from './attentionFeed.js';

export default function useStaffAttention({ client, enabled, userId, onAccessExpired }) {
  const [snapshot, setSnapshot] = useState({ userId: null, counts: null, revisions: {}, status: 'loading' });
  const callbacks = useRef(onAccessExpired);
  useEffect(() => { callbacks.current = onAccessExpired; }, [onAccessExpired]);
  const feedRef = useRef(null);
  useEffect(() => {
    if (!enabled || !userId) return;
    const feed = createAttentionFeed({ client, userId, onSnapshot: setSnapshot,
      onAccessExpired: () => callbacks.current?.() });
    feedRef.current = feed;
    return () => { feed.stop(); if (feedRef.current === feed) feedRef.current = null; };
  }, [client, enabled, userId]);
  const current = enabled && snapshot.userId === userId ? snapshot : { counts: null, revisions: {}, status: 'loading' };
  return { ...current, refresh: () => feedRef.current?.refresh() };
}
