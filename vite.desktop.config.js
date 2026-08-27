import {defineConfig} from 'vite'
import {fileURLToPath, URL} from 'node:url'
import {createServerOptions, createTauriBuildOptions, createVuePlugins,} from './vite.shared.js'

const root = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  plugins: createVuePlugins({
    componentsDirs: [fileURLToPath(new URL('./src/desktop/components', import.meta.url))],
  }),
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src/desktop', import.meta.url)),
      '@core': fileURLToPath(new URL('./src/core', import.meta.url)),
    },
  },
  clearScreen: false,
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  server: createServerOptions({port: 5173}),
  build: {
    ...createTauriBuildOptions(),
    outDir: 'dist-desktop',
    emptyOutDir: true,
  },
  root,
})
