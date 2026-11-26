import {metricsAllowed,METRICS_EVENT,METRICS_KEY} from '../legal/preferences.js';

export const GTM_CONTAINER_ID='GTM-53MT4CP9';
export const GTM_ROUTE_EVENT='mb:analytics-route';
const domains=new Set(['mibatute.com','www.mibatute.com']);
const pages=new Set(['/','/cookies','/privacidad','/terminos','/normas','/pagos']);
const denied={analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'};
const SCRIPT_ID='mibatute-google-tag-manager';

export function googleTagManagerPageAllowed(location) {
 return domains.has(location.hostname)&&pages.has(location.pathname)
  &&!/(?:[?#&])(?:access_token|refresh_token|token|token_hash|code|email|password)=/i.test((location.search||'')+(location.hash||''));
}

function clearAnalyticsCookies(doc,hostname) {
 try {
  for(const entry of doc.cookie.split(';')) {
   const name=entry.split('=')[0].trim();
   if(!/^_(?:ga(?:_|$)|gid$|gat(?:_|$))/.test(name))continue;
   const cookie=`${name}=; Max-Age=0; Path=/; SameSite=Lax; Secure`;
   doc.cookie=cookie;
   doc.cookie=`${cookie}; Domain=${hostname}`;
   doc.cookie=`${cookie}; Domain=.mibatute.com`;
  }
 }catch { /* Cookie access may be disabled. */ }
}

// Basic consent mode: no Google request or iframe before explicit metrics acceptance.
export function installGoogleTagManager({win,doc,enabled}) {
 if(!enabled)return ()=>{};
 let active=false,revoked=false,disposed=false,script;
 const allowed=()=>{
  try{return googleTagManagerPageAllowed(win.location)&&metricsAllowed(win.localStorage,win.navigator);}
  catch{return false;}
 };
 function revoke() {
  if(!active||revoked)return;
  revoked=true;
  win.gtag?.('consent','update',{...denied});
  script?.remove();
  clearAnalyticsCookies(doc,win.location.hostname);
  // Removing a script cannot unload running tags. A fresh page enforces the withdrawn choice.
  win.location.reload();
 }
 function sync(forceDenied=false) {
  if(disposed||revoked)return;
  if(forceDenied||!allowed()){revoke();return;}
  if(active||doc.getElementById(SCRIPT_ID))return;
  win.dataLayer=win.dataLayer||[];
  if(!Array.isArray(win.dataLayer))return;
  win.gtag=win.gtag||function(){win.dataLayer.push(arguments);};
  win.gtag('consent','default',{...denied});
  win.gtag('set',{allow_google_signals:false,allow_ad_personalization_signals:false});
  win.gtag('consent','update',{...denied,analytics_storage:'granted'});
  win.dataLayer.push({'gtm.start':Date.now(),event:'gtm.js'});
  script=doc.createElement('script');
  script.id=SCRIPT_ID;
  script.async=true;
  script.src=`https://www.googletagmanager.com/gtm.js?id=${GTM_CONTAINER_ID}`;
  script.referrerPolicy='strict-origin-when-cross-origin';
  script.onerror=()=>{script.remove();active=false;};
  active=true;
  doc.head.appendChild(script);
 }
 const preference=event=>sync(event.detail?.accepted!==true);
 const storage=event=>{if(event.key===METRICS_KEY||event.key===null)sync();};
 const visible=()=>{if(doc.visibilityState==='visible')sync();};
 const refresh=()=>sync();
 win.addEventListener(METRICS_EVENT,preference);
 win.addEventListener('storage',storage);
 win.addEventListener('pageshow',refresh);
 win.addEventListener('popstate',refresh);
 win.addEventListener(GTM_ROUTE_EVENT,refresh);
 doc.addEventListener('visibilitychange',visible);
 sync();
 return ()=>{
  disposed=true;
  win.removeEventListener(METRICS_EVENT,preference);
  win.removeEventListener('storage',storage);
  win.removeEventListener('pageshow',refresh);
  win.removeEventListener('popstate',refresh);
  win.removeEventListener(GTM_ROUTE_EVENT,refresh);
  doc.removeEventListener('visibilitychange',visible);
 };
}
