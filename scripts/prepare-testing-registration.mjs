import {writeFile} from 'node:fs/promises';
import {LEGAL_VERSION,LEGAL_OPERATOR} from '../src/legal/config.js';
import {policies} from '../src/legal/policies.js';
const documents=JSON.stringify({version:LEGAL_VERSION,reviewStatus:'draft',operator:LEGAL_OPERATOR,policies});
const sql=`begin;\ninsert into public.legal_releases(version,documents,enabled,published_at) values('${LEGAL_VERSION.replaceAll("'","''")}','${documents.replaceAll("'","''")}'::jsonb,false,clock_timestamp()) on conflict(version) do nothing;\ncommit;\n`;
const destination=process.argv[2]||'/tmp/mibatute-testing-notice.sql';
await writeFile(destination,sql,{flag:'wx',mode:0o600});
console.log('Draft snapshot prepared. No database changes were executed.');
