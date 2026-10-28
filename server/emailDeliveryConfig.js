import process from 'node:process';

// Expose readiness and variable names only, never secret values.
export function emailDeliveryConfig(env=process.env){
 const required={
  EMAIL_NOTIFICATIONS_ENABLED:env.EMAIL_NOTIFICATIONS_ENABLED==='true',
  RESEND_API_KEY:!!env.RESEND_API_KEY,
  NOTIFICATION_EMAIL_FROM:!!env.NOTIFICATION_EMAIL_FROM,
  SUPABASE_SERVICE_ROLE_KEY:!!env.SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_URL:!!(env.SUPABASE_URL||env.VITE_SUPABASE_URL),
 };
 const missing=Object.keys(required).filter(key=>!required[key]);
 return {manualReady:missing.length===0,automaticReady:missing.length===0&&!!env.CRON_SECRET,missing:[...missing,...(!env.CRON_SECRET?['CRON_SECRET']:[])]};
}
