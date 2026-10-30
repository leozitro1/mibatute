// Shrinking the photo can clamp scrollTop to zero when short content fits.
// Expansion needs an intentional gesture, never a resize-generated scroll event.
export function compactGalleryOnScroll(compact, scrollTop) {
  return compact || scrollTop > 48;
}

export function galleryAfterGesture(compact, deltaY, scrollTop, onGallery = false) {
  if (deltaY > 32 && scrollTop <= 4) return false;
  if (deltaY < -32 && onGallery) return true;
  return compact;
}
