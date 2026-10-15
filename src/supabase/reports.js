export async function submitArticleReport(client,articleId,reason,details) {
  const {data,error}=await client.rpc('submit_article_report',{p_article:articleId,p_reason:reason,p_details:details.trim()});
  if(error)throw error;
  return data;
}

export async function submitChatReport(client,chatId,reason,details) {
  const {data,error}=await client.rpc('submit_chat_report',{p_chat:chatId,p_reason:reason,p_details:details.trim()});
  if(error)throw error;
  return data;
}
