import {useEffect,useRef} from 'react';
import {Sparkles} from 'lucide-react';
import {creditBalanceIncreased} from './creditBalanceAnimation.js';

export default function CreditBalanceValue({value}){
 const element=useRef(null),previous=useRef(null);
 useEffect(()=>{
  const increased=creditBalanceIncreased(previous.current,value);
  previous.current=value;
  if(!increased||!element.current?.animate||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  const animations=[element.current.animate([
   {transform:'scale(1)',backgroundColor:'transparent',boxShadow:'0 0 0 0 #e9b84a00'},
   {transform:'scale(1.06)',backgroundColor:'#fff4d6',boxShadow:'0 0 16px 5px #e9b84a55',offset:0.3},
   {transform:'scale(1)',backgroundColor:'transparent',boxShadow:'0 0 0 0 #e9b84a00'},
  ],{duration:2000,iterations:5,easing:'ease-in-out'})];
  const sparkle=element.current.querySelector('[data-credit-sparkle]');
  if(sparkle)animations.push(sparkle.animate([
   {opacity:0,transform:'translate(0,4px) scale(.5)'},
   {opacity:1,transform:'translate(0,-3px) scale(1.1)',offset:0.35},
   {opacity:0,transform:'translate(2px,-12px) scale(.8)'},
  ],{duration:2000,iterations:5,easing:'ease-in-out'}));
  return()=>animations.forEach(animation=>animation.cancel());
 },[value]);
 return <span ref={element} className="credit-balance-value" aria-live="polite" aria-atomic="true">{value===null?'…':value}<Sparkles data-credit-sparkle size={20} aria-hidden="true" className="credit-balance-sparkle"/></span>;
}
