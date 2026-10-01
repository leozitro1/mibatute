export function preferLatestArticle(first, second) {
  if (!first) return second;
  if (!second) return first;
  const firstTime = Date.parse(first.updated_at || first.created_at || "") || 0;
  const secondTime = Date.parse(second.updated_at || second.created_at || "") || 0;
  return firstTime > secondTime ? { ...second, ...first } : { ...first, ...second };
}
