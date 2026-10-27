const inflight=new Map(),seen=new Map();
const DAY=24*60*60*1000;
let fallbackSession;
export async function recordArticleView(client,{articleId,ownerId,userId,staff=false,storage,now=Date.now()}){
 if(!articleId||staff||(userId&&userId===ownerId))return false;
 const key=`mb-view:${userId||'guest'}:${articleId}`;
 if(seen.get(key)>now||inflight.has(key))return false;
 let session;
 try{
  storage??=globalThis.sessionStorage;
  if(Number(storage?.getItem(key))>now){seen.set(key,Number(storage.getItem(key)));return false;}
  session=storage?.getItem('mb-view-session');
  if(!session){session=globalThis.crypto.randomUUID();storage?.setItem('mb-view-session',session);}
 }catch{session=fallbackSession??=globalThis.crypto.randomUUID();}
 session ||= fallbackSession??=globalThis.crypto.randomUUID();
 const request=client.rpc('record_article_view',{p_article:articleId,p_session:session});
 inflight.set(key,request);
 try{
  const {data,error}=await request;
  if(error)return false;
  seen.set(key,now+DAY);
  if(seen.size>500)seen.delete(seen.keys().next().value);
  try{storage?.setItem(key,String(now+DAY));}catch{/* Private browsing may disable storage. */}
  return data===true;
 }catch{return false;}finally{inflight.delete(key);}
}
