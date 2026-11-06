export function transactionChatReadOnly(articleState, chatState, { suspended = false, blocked = false } = {}) {
  return suspended || blocked || chatState !== 'open' || !['reservado','reserved'].includes(articleState);
}
