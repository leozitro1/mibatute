import {databaseActionError} from './databaseActionError.js';

export async function republishArticle(client, articleId) {
 const {data,error}=await client.rpc('owner_republish_article',{p_article_id:articleId});
 if(error)throw databaseActionError(error,'No se pudo republicar. Comprueba tus cupos e inténtalo de nuevo.');
 if(!data?.article||String(data.article.id)!==String(articleId))throw new Error('No se pudo confirmar la republicación. Actualiza la lista antes de reintentar.');
 return data.article;
}
