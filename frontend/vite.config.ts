import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const backendDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'backend',
)
const backendEntry = 'dist/main.js'
const backendArgs = ['--enable-source-maps', backendEntry]
const backendProcessArgs = backendArgs
const backendCwd = backendDir
const backendSpawnOptions = {
  cwd: backendCwd,
  detached: true,
  stdio: 'ignore',
  windowsHide: true,
} as const

function startBackend() {
  const child = spawn(
    process.execPath,
    backendProcessArgs,
    backendSpawnOptions,
  )
  child.unref()
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'start-backend',
      apply: 'serve',
      configureServer() {
        startBackend()
      },
    },
  ],
})
