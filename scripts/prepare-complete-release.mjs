import {readFile,writeFile} from 'node:fs/promises';
import {LEGAL_VERSION,LEGAL_OPERATOR} from '../src/legal/config.js';
import {policies} from '../src/legal/policies.js';
const names=['2026-10-19-legal-foundation.sql','2026-10-19-data-rights-workflow.sql','2026-10-19-support-closure-preview.sql','2026-10-19-testing-registration.sql'];
const parts=[];
for(const name of names){
 const source=(await readFile(new URL(`../supabase/migrations/${name}`,import.meta.url),'utf8')).trim();
 if(!source.startsWith('begin;')||!source.endsWith('commit;'))throw new Error(`Unexpected transaction wrapper: ${name}`);
 parts.push(`-- ${name}\n${source.slice(6,-7)}`);
}
const documents=JSON.stringify({version:LEGAL_VERSION,reviewStatus:'draft',operator:LEGAL_OPERATOR,policies});
parts.push(`insert into public.legal_releases(version,documents,enabled,published_at) values('${LEGAL_VERSION.replaceAll("'","''")}','${documents.replaceAll("'","''")}'::jsonb,false,clock_timestamp()) on conflict(version) do nothing;`);
const preflight="do $$begin if exists(select 1 from pg_trigger where tgrelid='auth.users'::regclass and tgname='capture_registration_consent' and not tgisinternal) then raise exception 'Unexpected strict registration guard. Stop and review before deploying.';end if;end;$$;";
await writeFile(process.argv[2]||'/tmp/mibatute-complete-release-review.sql',`begin;\n${preflight}\n${parts.join('\n')}\ncommit;\n`,{flag:'wx',mode:0o600});
console.log('Complete transaction prepared for review; no database changes were executed.');
