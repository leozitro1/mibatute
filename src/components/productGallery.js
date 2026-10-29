// Shrinking the photo can clamp scrollTop to zero when short content fits.
// Only explicit expansion or reopening the detail should expand it again.
export function compactGalleryOnScroll(compact, scrollTop) {
  return compact || scrollTop > 48;
}
