export const USER_CHAT_FILTERS = Object.freeze([
  {key:'all',label:'Todos'}, {key:'purchases',label:'Compras'},
  {key:'sales',label:'Ventas'}, {key:'donations',label:'Donaciones'},
]);

export function userChatType(row,userId) {
  const buyer = !!userId && String(row.buyer_id) === String(userId);
  const seller = !!userId && String(row.seller_id) === String(userId);
  if (!buyer && !seller) return null;
  return row.mode === 'venta'
    ? {key:buyer ? 'purchases' : 'sales',label:buyer ? 'Compra' : 'Venta'}
    : {key:'donations',label:buyer ? 'Rescate' : 'Donación'};
}
