export const PROFILE_PAGE_SIZE = 5;

export function paginateProfileItems(items, requestedPage = 1) {
  const pages = Math.max(1, Math.ceil(items.length / PROFILE_PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Math.floor(Number(requestedPage) || 1)));
  return { page, pages, total: items.length,
    items: items.slice((page - 1) * PROFILE_PAGE_SIZE, page * PROFILE_PAGE_SIZE) };
}
