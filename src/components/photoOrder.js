export function movePhoto(items,from,to) {
  if(!Number.isInteger(from)||!Number.isInteger(to)||from<0||to<0||from>=items.length||to>=items.length||from===to)return items;
  const next=[...items];const [photo]=next.splice(from,1);next.splice(to,0,photo);return next;
}
export function orderPhotos(images,ids=[]) {
  const rank=new Map(ids.map((id,index)=>[id,index]));
  return [...images].sort((a,b)=>(rank.get(a.id)??ids.length)-(rank.get(b.id)??ids.length));
}
