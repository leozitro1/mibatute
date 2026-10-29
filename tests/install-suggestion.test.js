import test from 'node:test';
import assert from 'node:assert/strict';
import { INSTALL_DISMISSED_KEY, INSTALLED_MODE, MOBILE_WIDTH, installSuggestionPlatform } from '../src/components/installSuggestion.js';

function browser({ userAgent = 'iPhone', platform = 'iPhone', maxTouchPoints = 1, mobile = true, installed = false, standalone = false, dismissed = false, storageBlocked = false } = {}) {
  return {
    navigator: { userAgent, platform, maxTouchPoints, standalone },
    matchMedia: query => ({ matches: query === MOBILE_WIDTH ? mobile : query === INSTALLED_MODE && installed }),
    sessionStorage: { getItem: key => { if (storageBlocked) throw new Error('Unavailable'); return key === INSTALL_DISMISSED_KEY && dismissed ? '1' : null; } },
  };
}

test('installation advice selects iPhone, desktop-mode iPad and Android instructions', () => {
  assert.equal(installSuggestionPlatform(browser()), 'ios');
  assert.equal(installSuggestionPlatform(browser({ userAgent: 'Macintosh', platform: 'MacIntel', maxTouchPoints: 5 })), 'ios');
  assert.equal(installSuggestionPlatform(browser({ userAgent: 'Android', platform: 'Linux' })), 'android');
});

test('installation advice stays hidden inside installed apps, on desktop and after dismissal', () => {
  for (const config of [{ installed: true }, { standalone: true }, { mobile: false }, { dismissed: true }, { userAgent: 'Macintosh', platform: 'MacIntel', maxTouchPoints: 0 }]) {
    assert.equal(installSuggestionPlatform(browser(config)), null);
  }
});

test('installation advice handles blocked session storage and non-browser rendering', () => {
  assert.equal(installSuggestionPlatform(browser({ storageBlocked: true })), 'ios');
  assert.equal(installSuggestionPlatform(null), null);
});
