export const METRICS_KEY='mb_optional_metrics_v1';
export const METRICS_EVENT='mb:metrics-preference';
export function metricsAllowed(storage,signals={}) {
  if(signals.doNotTrack==='1'||signals.globalPrivacyControl===true)return false;
  try{return storage?.getItem(METRICS_KEY)==='accepted';}catch{return false;}
}
export function saveMetricsPreference(value) {
  const accepted=value===true;
  try{localStorage.setItem(METRICS_KEY,accepted?'accepted':'rejected');}catch{/* No persistent consent means metrics remain off. */}
  window.dispatchEvent(new CustomEvent(METRICS_EVENT,{detail:{accepted}}));
}
