import {useEffect,useState} from 'react';
import {cachedPublicationRules,loadPublicationRules} from '../supabase/publicationRules.js';
export default function usePublicationRules(enabled=true){
 const [rules,setRules]=useState(cachedPublicationRules);
 useEffect(()=>{
  if(!enabled)return;
  let active=true;
  loadPublicationRules().then(value=>{if(active)setRules(value);}).catch(()=>{/* The database remains authoritative if the preview cannot refresh. */});
  return()=>{active=false;};
 },[enabled]);
 return rules;
}
