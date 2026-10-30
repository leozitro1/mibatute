const validVersion = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{8,80}$/.test(value);

// One tiny static file; no backend, socket or background checks.
export function watchAppVersion({currentVersion,onUpdate,browser = window,now = Date.now}) {
  if (!validVersion(currentVersion)) return () => {};
  let disposed = false, found = false, pending = false, lastCheck = -Infinity, controller;
  const check = async () => {
    if (disposed || found || pending || browser.document.visibilityState !== 'visible' || browser.navigator.onLine === false || now()-lastCheck < 60_000) return;
    pending = true;lastCheck = now();controller = new AbortController();
    const timeout = browser.setTimeout(() => controller.abort(),8000);
    try {
      const response = await browser.fetch('/app-version.json',{cache:'no-store',signal:controller.signal});
      if (!response.ok) return;
      const data = await response.json();
      if (!disposed && validVersion(data?.version) && data.version !== currentVersion) {
        found = true;onUpdate(data.version);
      }
    } catch { /* Offline, missing files and failed deployments never interrupt the app. */ }
    finally { browser.clearTimeout(timeout);pending = false; }
  };
  const events = ['focus','online'];
  events.forEach(event => browser.addEventListener(event,check));
  browser.document.addEventListener('visibilitychange',check);
  const timer = browser.setInterval(check,10*60_000);
  check();
  return () => {
    disposed = true;controller?.abort();browser.clearInterval(timer);
    events.forEach(event => browser.removeEventListener(event,check));
    browser.document.removeEventListener('visibilitychange',check);
  };
}
