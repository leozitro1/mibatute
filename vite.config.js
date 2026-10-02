import { defineConfig, loadEnv } from 'vite'
import process from 'node:process'
import react from '@vitejs/plugin-react'
import { localApiPlugin } from './scripts/local-api.mjs'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), localApiPlugin(loadEnv(mode, process.cwd(), ''))],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
}))
