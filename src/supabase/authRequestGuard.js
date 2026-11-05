// Browser courtesy limits. Supabase must enforce the actual abuse protection.
// Stores only bounded counters/deadlines, never email addresses or credentials.
export function createAuthRequestGuard({ now = Date.now, getStorage = () => globalThis.localStorage } = {}) {
  const projects = new Map();
  return (supabaseUrl, fetchImpl = (...args) => globalThis.fetch(...args)) => {
    const base = new URL(supabaseUrl);
    const prefix = `${base.pathname.replace(/\/$/, '')}/auth/v1/`;
    const key = `mibatute:auth-wait:v1:${base.origin}${prefix}`;
    if (!projects.has(key)) projects.set(key, { emailUntil: 0, loginUntil: 0, failures: 0, busy: new Set() });
    const state = projects.get(key);
    const save = () => {
      try { getStorage()?.setItem(key, JSON.stringify({ emailUntil: state.emailUntil, loginUntil: state.loginUntil, failures: state.failures })); } catch { /* Private browsing: memory fallback. */ }
    };
    return async (input, init) => {
      const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
      const method = (init?.method || input?.method || 'GET').toUpperCase();
      const endpoint = url.pathname.slice(prefix.length);
      const kind = method !== 'POST' || url.origin !== base.origin || !url.pathname.startsWith(prefix) ? null
        : ['signup', 'recover', 'resend', 'otp', 'magiclink'].includes(endpoint) ? 'email'
        : endpoint === 'token' && url.searchParams.get('grant_type') === 'password' ? 'login' : null;
      if (!kind) return fetchImpl(input, init);
      try {
        const stored = JSON.parse(getStorage()?.getItem(key) || 'null');
        for (const field of ['emailUntil', 'loginUntil', 'failures']) {
          if (Number.isFinite(stored?.[field]) && stored[field] >= 0) state[field] = stored[field];
        }
      } catch { /* Storage is optional, not a security boundary. */ }
      const field = `${kind}Until`;
      const remaining = Math.max(0, Math.ceil((state[field] - now()) / 1000));
      if (state.busy.has(kind) || remaining > 0) {
        const seconds = remaining || 1;
        return Response.json({ code: 'over_request_rate_limit', msg: `Espera ${seconds} segundos antes de volver a intentarlo.` },
          { status: 429, headers: { 'Retry-After': String(seconds), 'Cache-Control': 'no-store', 'X-Supabase-Api-Version': '2024-01-01' } });
      }
      state.busy.add(kind);
      try {
        const response = await fetchImpl(input, init);
        if (kind === 'email' && response.ok) state.emailUntil = now() + 60000;
        if (kind === 'login') {
          state.failures = response.ok ? 0 : Math.min(5, state.failures + 1);
          state.loginUntil = now() + (state.failures >= 5 ? 60000 : 1000);
          if (state.failures >= 5) state.failures = 0;
        }
        if (response.status === 429) {
          const retry = response.headers.get('Retry-After');
          const seconds = retry && /^\d+$/.test(retry) ? Number(retry) : Math.ceil((Date.parse(retry) - now()) / 1000);
          state[field] = now() + Math.max(60, Number.isFinite(seconds) ? Math.min(seconds, 3600) : 60) * 1000;
        }
        return response;
      } catch (error) {
        // A lost response may already have sent an email. Never retry it automatically.
        state[field] = now() + (kind === 'email' ? 60000 : 1000);
        throw error;
      } finally {
        state.busy.delete(kind);
        save();
      }
    };
  };
}

export const authFetchFor = createAuthRequestGuard();
