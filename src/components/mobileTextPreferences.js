export const TEXT_SIZES = Object.freeze({normal:1,large:1.125,largest:1.25});
export const TEXT_SIZE_KEY = 'mb_mobile_text_size';
const EVENT = 'mb:mobile-text-size';
let sessionValue;
const normalize = value => Object.hasOwn(TEXT_SIZES,value) ? value : 'normal';

export function readTextSize(storage) {
  if (sessionValue !== undefined) return sessionValue;
  try {return normalize(storage?.getItem(TEXT_SIZE_KEY));} catch {return 'normal';}
}

export function writeTextSize(storage,value,browser = globalThis.window) {
  sessionValue = normalize(value);
  try {storage?.setItem(TEXT_SIZE_KEY,sessionValue);} catch { /* Keep the setting for this session. */ }
  browser?.dispatchEvent(new Event(EVENT));
}

export function subscribeTextSize(listener) {
  const storage = event => {
    if (event.key === TEXT_SIZE_KEY || event.key === null) {sessionValue=undefined;listener();}
  };
  window.addEventListener(EVENT,listener);window.addEventListener('storage',storage);
  return () => {window.removeEventListener(EVENT,listener);window.removeEventListener('storage',storage);};
}
