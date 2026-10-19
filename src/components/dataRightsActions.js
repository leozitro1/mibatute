// Explain the server's final-response requirements using persisted case data.
export function finalResponseBlockers(row,workDraft={}) {
 const blockers=[];
 const unsaved=(workDraft.verification??row.verification)!==row.verification
  ||(workDraft.notes??row.internal_notes??'').trim()!==(row.internal_notes??'').trim()
  ||(workDraft.delivery??row.delivery_confirmed??false)!==(row.delivery_confirmed??false);
 if(unsaved)blockers.push('Guarda primero los cambios del seguimiento interno.');
 if(!row.verification||row.verification==='pending')blockers.push('La verificación guardada está pendiente. Selecciona la opción que corresponda y guarda el seguimiento interno.');
 if((row.internal_notes??'').trim().length<10)blockers.push('Guarda notas internas de al menos 10 caracteres que documenten la verificación y las acciones.');
 if(row.source==='email'&&!row.delivery_confirmed)blockers.push('Confirma y guarda el envío manual de la respuesta por correo.');
 return blockers;
}
