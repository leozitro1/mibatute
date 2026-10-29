import test from 'node:test';
import assert from 'node:assert/strict';
import { compactGalleryOnScroll } from '../src/components/productGallery.js';

test('a short listing stays compact when the larger information pane clamps scroll to zero', () => {
  const contentHeight = 470, expandedPane = 340, compactPane = 560;
  let top = Math.min(80, contentHeight - expandedPane);
  let compact = compactGalleryOnScroll(false, top);
  assert.equal(compact, true);
  top = Math.min(top, Math.max(0, contentHeight - compactPane));
  assert.equal(top, 0);
  for (const position of [top, -12, 0, 5, 0]) {
    compact = compactGalleryOnScroll(compact, position);
    assert.equal(compact, true, 'layout adjustments and Safari bounce must not expand the photo');
  }
});

test('long listings stay compact while reading and explicit expansion resets the state', () => {
  let compact = false;
  for (const position of [0, 20, 48]) assert.equal(compactGalleryOnScroll(compact, position), false);
  for (const position of [72, 200, 600, 25, 0, -8]) {
    compact = compactGalleryOnScroll(compact, position);
    assert.equal(compact, true);
  }
  // The existing expand button resets both state and scroll position.
  compact = false;
  assert.equal(compactGalleryOnScroll(compact, 0), false);
  assert.equal(compactGalleryOnScroll(compact, 80), true);
});
