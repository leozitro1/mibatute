export const INSTALL_DISMISSED_KEY = 'mb_install_suggestion_dismissed';
export const INSTALLED_MODE = '(display-mode: standalone), (display-mode: fullscreen), (display-mode: minimal-ui)';
export const MOBILE_WIDTH = '(max-width: 1023px)';

export function installSuggestionPlatform(browser = globalThis.window) {
  if (!browser || !browser.matchMedia(MOBILE_WIDTH).matches || browser.navigator.standalone === true || browser.matchMedia(INSTALLED_MODE).matches) return null;
  try { if (browser.sessionStorage.getItem(INSTALL_DISMISSED_KEY) === '1') return null; } catch { /* The hint still works when storage is unavailable. */ }
  const { userAgent = '', platform = '', maxTouchPoints = 0 } = browser.navigator;
  if (/iPhone|iPad|iPod/i.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1)) return 'ios';
  return /Android/i.test(userAgent) ? 'android' : null;
}
