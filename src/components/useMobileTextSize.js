import { useLayoutEffect, useSyncExternalStore } from 'react';
import { readTextSize, writeTextSize, subscribeTextSize, TEXT_SIZES } from './mobileTextPreferences.js';

function storage() {
  try {return window.localStorage;} catch {return undefined;}
}

export default function useMobileTextSize(active) {
  const size = useSyncExternalStore(subscribeTextSize,() => readTextSize(storage()),() => 'normal');
  useLayoutEffect(() => {
    if (!active) return;
    const root = document.documentElement;
    const previous = root.style.getPropertyValue('--mb-text-scale');
    const previousSize = root.getAttribute('data-mb-text-size');
    root.style.setProperty('--mb-text-scale',String(TEXT_SIZES[size]));
    root.setAttribute('data-mb-text-size',size);
    return () => {
      if (previous) root.style.setProperty('--mb-text-scale',previous);
      else root.style.removeProperty('--mb-text-scale');
      if (previousSize === null) root.removeAttribute('data-mb-text-size');
      else root.setAttribute('data-mb-text-size',previousSize);
    };
  },[active,size]);
  return {size,setSize:value => writeTextSize(storage(),value)};
}
