// iOS keeps the layout viewport tall when the keyboard opens. Fit only this chat
// to the visual viewport, without changing page scale or blocking pinch zoom.
export function trackChatViewport(element,browser = window) {
  const viewport = browser.visualViewport;
  if (!viewport) return () => {};
  const mobile = browser.matchMedia('(max-width: 1023px)');
  let frame = null;
  const clear = () => {
    element.style.removeProperty('--chat-viewport-height');
    element.style.removeProperty('--chat-viewport-top');
  };
  const update = () => {
    frame = null;
    if (!mobile.matches) { clear();return; }
    if (Math.abs(viewport.scale-1) > .05 || !(viewport.height > 0)) return;
    element.style.setProperty('--chat-viewport-height',`${viewport.height}px`);
    element.style.setProperty('--chat-viewport-top',`${Math.max(0,viewport.offsetTop)}px`);
  };
  const schedule = () => {if (frame === null) frame = browser.requestAnimationFrame(update);};
  viewport.addEventListener('resize',schedule);
  viewport.addEventListener('scroll',schedule);
  mobile.addEventListener('change',schedule);
  update();
  return () => {
    viewport.removeEventListener('resize',schedule);
    viewport.removeEventListener('scroll',schedule);
    mobile.removeEventListener('change',schedule);
    if (frame !== null) browser.cancelAnimationFrame(frame);
    clear();
  };
}
