import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { seedLocal } from './seed-local.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const dockerBin = '/Applications/Docker.app/Contents/Resources/bin';
const env = { ...process.env, PATH: `${dockerBin}:${process.env.PATH}` };

try {
  if (!process.argv.includes('--already-started')) {
    execFileSync('docker', ['info', '--format', '{{.ServerVersion}}'], { env, stdio: 'pipe' });
    console.log('Iniciando los servicios de Supabase local...');
    execFileSync('npx', ['--yes', 'supabase@2.119.0', 'start'], { cwd: root, env, stdio: ['ignore', 'ignore', 'inherit'] });
  }
  const status = JSON.parse(execFileSync('npx', ['--yes', 'supabase@2.119.0', 'status', '-o', 'json'], {
    cwd: root, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  }));
  const url = status.API_URL;
  if (new URL(url).hostname !== '127.0.0.1' || !status.ANON_KEY || !status.SERVICE_ROLE_KEY) {
    throw new Error('Se esperaba la configuracion de Supabase local en 127.0.0.1.');
  }
  const target = new URL('../.env.development.local', import.meta.url);
  if (existsSync(target)) {
    // Keep a recoverable copy when regenerating the local configuration.
    const { copyFile } = await import('node:fs/promises');
    await copyFile(target, new URL('../.env.development.backup.local', import.meta.url));
  }
  await writeFile(target, [
    '# Generated for local development only. Production uses Vercel environment variables.',
    `VITE_SUPABASE_URL=${url}`,
    `VITE_SUPABASE_ANON_KEY=${status.ANON_KEY}`,
    'VITE_LOCAL_SERVICES=true',
    `SUPABASE_URL=${url}`,
    `SUPABASE_ANON_KEY=${status.ANON_KEY}`,
    '',
  ].join('\n'), { mode: 0o600 });
  await seedLocal(status);
  console.log('MiBatute local: http://127.0.0.1:5173');
  console.log('Supabase Studio: http://127.0.0.1:54323');
  console.log('Correos de prueba: http://127.0.0.1:54324');
} catch (error) {
  console.error('No se pudo completar el entorno local:', error.message);
  console.error('Docker Desktop debe estar instalado y abierto.');
  process.exitCode = 1;
}
