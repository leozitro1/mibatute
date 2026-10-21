export async function savePhotoOrder(client,articleId,ids,fields=null) {
 const {data,error}=await client.rpc('owner_save_article_photo_order',{p_article_id:articleId,p_order:ids,p_fields:fields});
 if(error)return {success:false,error:error.code==='PGRST202'?'Falta habilitar el orden de fotos en la base de datos.':error.message};
 return data?.id?{success:true,data}:{success:false,error:'No se pudo confirmar el orden de las fotos.'};
}
