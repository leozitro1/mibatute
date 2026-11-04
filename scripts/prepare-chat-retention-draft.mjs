import {writeFile} from 'node:fs/promises';
import {LEGAL_VERSION,LEGAL_OPERATOR,LEGAL_APPROVED,LEGAL_READY} from '../src/legal/config.js';
import {policies} from '../src/legal/policies.js';
if(LEGAL_APPROVED||LEGAL_READY)throw new Error('Este script solo prepara un borrador, sin aprobación jurídica ni activación definitiva.');
const documents=JSON.stringify({version:LEGAL_VERSION,reviewStatus:'draft',operator:LEGAL_OPERATOR,policies});
const quote=value=>`'${value.replaceAll("'","''")}'`;
const sql=`begin;
insert into public.legal_releases(version,documents,enabled,published_at)
values(${quote(LEGAL_VERSION)},${quote(documents)}::jsonb,false,clock_timestamp()) on conflict(version) do nothing;
do $$begin
 if not exists(select 1 from public.legal_releases where version=${quote(LEGAL_VERSION)} and not enabled and documents=${quote(documents)}::jsonb) then
  raise exception 'El borrador registrado no coincide; no sobrescribir una versión existente.';
 end if;
end $$;
commit;
`;
const destination=process.argv[2]||'/private/tmp/mibatute-chat-retention-draft.sql';
await writeFile(destination,sql,{flag:'wx',mode:0o600});
console.log(`Borrador ${LEGAL_VERSION} preparado en ${destination}; no ejecutado ni habilitado.`);
