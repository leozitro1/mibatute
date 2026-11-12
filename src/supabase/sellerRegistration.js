export const SELLER_NOTICE_VERSION='seller-2026-11-10.1';
export const SELLER_REGISTRATION_REQUIRED='P7501';
export const SELLER_REGISTRATION_MESSAGE='Completa el registro de vendedor en Mi perfil para ofrecer un producto.';

function hasLocalDatabase(value){
  try{return ['localhost','127.0.0.1','[::1]'].includes(new URL(value).hostname);}
  catch{return false;}
}

export const SELLER_REGISTRATION_PREVIEW=import.meta.env?.DEV===true
  &&import.meta.env.VITE_SELLER_REGISTRATION_PREVIEW==='true'
  &&import.meta.env.VITE_LOCAL_SERVICES==='true'&&hasLocalDatabase(import.meta.env.VITE_SUPABASE_URL);

export async function checkSellerRegistration(client,mode,enabled=SELLER_REGISTRATION_PREVIEW){
  if(!enabled||mode!=='venta')return null;
  try{
    const {data,error}=await client.rpc('my_seller_registration_status');
    if(!error&&data?.enabled===true&&typeof data.ready==='boolean'){
      return data.ready?null:{success:false,code:SELLER_REGISTRATION_REQUIRED,error:SELLER_REGISTRATION_MESSAGE};
    }
  }catch{/* No subir fotos si no se pudo comprobar el registro. */}
  return {success:false,error:'No se pudo comprobar el registro de vendedor. Vuelve a intentarlo.'};
}
