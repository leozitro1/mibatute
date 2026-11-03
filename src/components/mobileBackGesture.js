const EDITABLE = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';
const EXCLUDED = `${EDITABLE}, button, a, [role="slider"], [data-mobile-back-ignore], .product-detail-gallery, .article-photo-viewer, .chat-article-gallery`;

// Only explicitly supported surfaces may close. Other dialogs and forms block back.
export function mobileBackAction(target, doc, onPageBack) {
  if (!target?.closest || target.closest(EXCLUDED) || doc.activeElement?.matches(EDITABLE)) return null;
  const modal = target.closest('dialog, [role="dialog"]');
  if (modal) {
    if (modal.matches('[data-mobile-back-block="true"]') || modal.querySelector('form')) return null;
    const close = modal.querySelector('[data-mobile-back]');
    return close && !close.disabled ? () => close.click() : null;
  }
  if (doc.querySelector('dialog[open], [role="dialog"][aria-modal="true"]')) return null;
  return onPageBack;
}

export function attachMobileBackGesture(doc, getAction, viewport = () => 1) {
  let gesture = null;
  const cancel = () => { gesture = null; };
  const start = event => {
    cancel();
    if (event.touches.length !== 1 || viewport() > 1.01) return;
    const touch = event.touches[0];
    if (touch.clientX < 0 || touch.clientX > 28) return;
    const back = getAction(event.target);
    if (back) gesture = {id:touch.identifier,x:touch.clientX,y:touch.clientY,time:event.timeStamp,target:event.target};
  };
  const move = event => {
    if (!gesture) return;
    if (event.touches.length !== 1) return cancel();
    const touch = event.touches[0];
    const dx = touch.clientX - gesture.x;
    const dy = Math.abs(touch.clientY - gesture.y);
    if (touch.identifier !== gesture.id || dy > 24 || dx < -8 || viewport() > 1.01) return cancel();
    if (dx > 14 && dx > dy * 2 && event.cancelable) event.preventDefault();
  };
  const end = event => {
    const current = gesture;
    cancel();
    const touch = event.changedTouches[0];
    if (!current || !touch || event.touches.length || touch.identifier !== current.id || viewport() > 1.01) return;
    const dx = touch.clientX - current.x;
    const dy = Math.abs(touch.clientY - current.y);
    const duration = event.timeStamp - current.time;
    if (dx >= 80 && dy <= 24 && dx > dy * 2 && duration >= 0 && duration <= 1000 && current.target.isConnected !== false) getAction(current.target)?.();
  };
  doc.addEventListener('touchstart',start,{passive:true,capture:true});
  doc.addEventListener('touchmove',move,{passive:false,capture:true});
  doc.addEventListener('touchend',end,{passive:true,capture:true});
  doc.addEventListener('touchcancel',cancel,{passive:true,capture:true});
  return () => {
    cancel();
    for (const [name,handler] of [['touchstart',start],['touchmove',move],['touchend',end],['touchcancel',cancel]]) doc.removeEventListener(name,handler,true);
  };
}
