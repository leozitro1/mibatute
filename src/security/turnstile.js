export const TURNSTILE_SITE_KEY = String(import.meta.env?.VITE_TURNSTILE_SITE_KEY || '').trim();

export function captchaOptions(token, siteKey = TURNSTILE_SITE_KEY) {
  if (!siteKey) return {};
  if (typeof token !== 'string' || !token.trim()) {
    throw Object.assign(new Error('Completa o renueva la verificación de seguridad antes de continuar.'), { code: 'captcha_required' });
  }
  return { captchaToken: token };
}

let loading;
export function loadTurnstile() {
  if (globalThis.turnstile) return Promise.resolve(globalThis.turnstile);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const timer = setTimeout(() => fail(), 15000);
    function fail() {
      clearTimeout(timer); script.remove(); loading = null;
      reject(new Error('No se pudo cargar la verificación de seguridad.'));
    }
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = () => {
      clearTimeout(timer);
      if (globalThis.turnstile) resolve(globalThis.turnstile);
      else fail();
    };
    script.onerror = fail;
    document.head.append(script);
  });
  return loading;
}

export function createCaptchaWidget(container, { siteKey, onMessage, load = loadTurnstile, now = Date.now }) {
  let active = true, api, id = null, token = null;
  const invalidate = message => { if (active) { token = null; onMessage(message); } };
  const ready = load().then(loaded => {
    if (!active) return;
    api = loaded;
    id = api.render(container, {
      sitekey: siteKey, language: 'es', size: 'flexible',
      retry: 'never', 'refresh-expired': 'manual', 'refresh-timeout': 'manual', 'response-field': false,
      callback: value => { if (active) { token = { value, expiresAt: now() + 290000 }; onMessage(''); } },
      'expired-callback': () => invalidate('La verificación venció. Renuévala para continuar.'),
      'timeout-callback': () => invalidate('La verificación agotó su tiempo. Puedes reintentar.'),
      'error-callback': () => { invalidate('No se pudo verificar. Revisa tu conexión y reintenta.'); return true; },
    });
  }).catch(() => invalidate('No se pudo cargar la verificación. Revisa tu conexión o bloqueador y reintenta.'));
  return {
    ready,
    takeToken() {
      const current = token; token = null;
      return active && current && now() < current.expiresAt ? current.value : undefined;
    },
    reset() { if (active) { token = null; if (id !== null) { onMessage(''); api.reset(id); } } },
    destroy() { active = false; token = null; if (id !== null) { api.remove(id); id = null; } },
  };
}
