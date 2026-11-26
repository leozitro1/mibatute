import {useEffect} from 'react';
import {useLocation} from 'react-router-dom';
import {GTM_ROUTE_EVENT} from './googleTagManager.js';

export default function AnalyticsRoute() {
 const {pathname,search,hash}=useLocation();
 useEffect(()=>{window.dispatchEvent(new Event(GTM_ROUTE_EVENT));},[pathname,search,hash]);
 return null;
}
