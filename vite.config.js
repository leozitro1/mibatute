import { defineConfig, loadEnv } from 'vite'
import process from 'node:process'
import react from '@vitejs/plugin-react'
import { localApiPlugin } from './scripts/local-api.mjs'
import { localAppPreview } from './scripts/local-app-preview.mjs'
import { appVersion } from './scripts/app-version.mjs'
import { localCspReview } from './scripts/local-csp-review.mjs'

// https://vite.dev/config/
export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const cspReview = command === 'serve' && process.env.MIBATUTE_CSP_REVIEW === '1'
  if (cspReview && (env.VITE_LOCAL_SERVICES !== 'true' || ![env.VITE_SUPABASE_URL, env.SUPABASE_URL || env.VITE_SUPABASE_URL].every(value => {
    try { return ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(value).hostname) } catch { return false }
  }))) throw new Error('La revisión CSP requiere Supabase y los servicios de desarrollo locales.')
  return {
    plugins: [react(), localApiPlugin(env), localAppPreview(), appVersion(), ...(cspReview ? [localCspReview()] : [])],
    server: { host: '127.0.0.1', port: 5173, strictPort: true },
  }
})
