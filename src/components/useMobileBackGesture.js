import { useEffect } from 'react';
import { attachMobileBackGesture, mobileBackAction } from './mobileBackGesture.js';

export default function useMobileBackGesture(enabled, onPageBack) {
  useEffect(() => {
    if (!enabled) return;
    return attachMobileBackGesture(document,
      target => mobileBackAction(target,document,onPageBack),
      () => window.visualViewport?.scale || 1);
  },[enabled,onPageBack]);
}
