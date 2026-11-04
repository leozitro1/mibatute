import {useEffect,useState} from 'react';
export default function useChatRetentionClock(active) {
 const [now,setNow]=useState(Date.now);
 useEffect(()=>{
  if(!active)return;
  const update=()=>setNow(Date.now());
  const timer=setInterval(update,60_000);window.addEventListener('focus',update);
  return()=>{clearInterval(timer);window.removeEventListener('focus',update);};
 },[active]);
 return now;
}
