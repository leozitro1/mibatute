import { useEffect, useImperativeHandle, useRef, useState } from 'react';
import { createCaptchaWidget, TURNSTILE_SITE_KEY } from '../security/turnstile.js';

export default function AuthCaptcha({ ref }) {
  const container = useRef(null), widget = useRef(null);
  const [message, setMessage] = useState(''), [attempt, setAttempt] = useState(0);
  useImperativeHandle(ref, () => ({
    takeToken: () => widget.current?.takeToken(),
    reset: () => widget.current?.reset(),
  }), []);
  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return;
    const controller = createCaptchaWidget(container.current, { siteKey: TURNSTILE_SITE_KEY, onMessage: setMessage });
    widget.current = controller;
    return () => { controller.destroy(); widget.current = null; };
  }, [attempt]);
  if (!TURNSTILE_SITE_KEY) return null;
  return <div className="my-3">
    <p className="mb-2 text-xs text-gray-600">Verificación de seguridad de Cloudflare. <a className="underline" href="/privacidad" target="_blank" rel="noopener noreferrer">Privacidad</a> · <a className="underline" href="https://www.cloudflare.com/turnstile-privacy-policy/" target="_blank" rel="noopener noreferrer">Aviso de Turnstile</a></p>
    <div ref={container} aria-label="Verificación de seguridad" />
    {message && <div role="status" className="text-sm text-gray-700"><p>{message}</p><button type="button" className="underline" onClick={() => { setMessage(''); setAttempt(value => value + 1); }}>Reintentar verificación</button></div>}
  </div>;
}
