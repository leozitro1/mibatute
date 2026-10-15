export const EMPTY_AUDIT_FILTERS={group:'',days:0,actor:''};
export const AUDIT_GROUPS={sessions:'Accesos',articles:'Publicaciones',reports:'Reportes',users:'Usuarios',credits:'Créditos',chats:'Chats',campaigns:'Campañas',team:'Equipo',other:'Otras acciones'};
export function auditMemberLabel(member) {
  return [member.name,member.email&&member.email!==member.name?member.email:'',member.retired?`Retirado (${member.id.slice(0,8)})`:member.active===false?'Desactivado':''].filter(Boolean).join(' · ');
}
