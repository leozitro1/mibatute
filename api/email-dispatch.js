import {Buffer} from 'node:buffer';
import process from 'node:process';
import {timingSafeEqual} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {deliverNotifications} from '../server/emailNotifications.js';

export const maxDuration=60;
const send=(res,status,body)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(body));};
function same(a,b){return !!a&&!!b&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));}
export default async function handler(req,res){
 if(!['GET','POST'].includes(req.method))return send(res,405,{error:'Método no permitido.'});
 // An inactive schedule exits without authentication/database/provider calls. Manual actions still require MFA.
 if(req.method==='GET'&&process.env.EMAIL_NOTIFICATIONS_ENABLED!=='true')return send(res,200,{configured:false,sent:0});
 const url=process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL;
 const anon=process.env.SUPABASE_ANON_KEY||process.env.VITE_SUPABASE_ANON_KEY;
 const token=(req.headers.authorization||'').replace(/^Bearer /,'');
 const cron=req.method==='GET'&&same(token,process.env.CRON_SECRET);
 if(!cron){
  if(req.method!=='POST'||!token||!url||!anon)return send(res,401,{error:'Acceso no autorizado.'});
  const userClient=createClient(url,anon,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false}});
  // RPC enforces the master role, MFA and a current staff session server-side.
  const {error}=await userClient.rpc('staff_email_settings');
  if(error)return send(res,403,{error:'Acceso no autorizado.'});
 }
 if(process.env.EMAIL_NOTIFICATIONS_ENABLED!=='true')return send(res,200,{configured:false,sent:0,error:'El envío real está desactivado en este entorno.'});
 const apiKey=process.env.RESEND_API_KEY,from=process.env.NOTIFICATION_EMAIL_FROM,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!apiKey||!from||!key||!url)return send(res,503,{configured:false,error:'Falta configurar el remitente o las credenciales del servidor.'});
 try{
  const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const result=await deliverNotifications({client,apiKey,from,max:3});
  return send(res,200,{configured:true,...result});
 }catch{return send(res,503,{error:'No se pudo completar el envío. Consulta el estado antes de intentarlo de nuevo.'});}
}
