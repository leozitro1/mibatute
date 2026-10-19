import test from 'node:test';
import assert from 'node:assert/strict';
import {finalResponseBlockers} from '../src/components/dataRightsActions.js';

test('a final reply explains pending verification even when a review reply and notes were saved',()=>{
 const row={status:'reviewing',source:'web',verification:'pending',internal_notes:'Prueba local: respuesta general sin divulgar datos.',response:'Respuesta provisional guardada.',delivery_confirmed:false};
 assert.equal(finalResponseBlockers(row).length,1);
 assert.match(finalResponseBlockers(row)[0],/verificación guardada está pendiente/);
 assert.equal(finalResponseBlockers(row,{verification:'not_required'}).length,2,'Changing the select is insufficient until follow-up is persisted');
 assert.deepEqual(finalResponseBlockers({...row,verification:'not_required'}),[]);
});

test('unsaved changes and email delivery remain required without blocking a no-op draft',()=>{
 const row={source:'email',verification:'not_required',internal_notes:'Respuesta general enviada por correo.',delivery_confirmed:false};
 assert.match(finalResponseBlockers(row)[0],/envío manual/);
 assert.equal(finalResponseBlockers(row,{delivery:true}).length,2);
 const delivered={...row,delivery_confirmed:true};
 assert.deepEqual(finalResponseBlockers(delivered,{notes:` ${row.internal_notes} `,delivery:true}),[]);
 assert.match(finalResponseBlockers(delivered,{notes:'Se cambió la actuación documentada.'})[0],/Guarda primero/);
 assert.match(finalResponseBlockers({...delivered,internal_notes:''})[0],/al menos 10/);
});
