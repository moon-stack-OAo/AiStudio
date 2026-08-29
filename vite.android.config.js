import {defineConfig} from 'vite'
import {fileURLToPath, URL} from 'node:url'
import {existsSync, renameSync} from 'node:fs'
import {join} from 'node:path'
import {createServerOptions, createTauriBuildOptions, createVuePlugins} from './vite.shared.js'

const root = fileURLToPath(new URL('.', import.meta.url))
const outDir = 'dist-android'

/** 开发态将 / 指到 Android 入口；构建后将产物重命名为 index.html */
function androidHtmlPlugin() {
  return {
    name: 'android-html',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (!req.url) return next()
        const pathOnly = req.url.split('?')[0]
        if (pathOnly === '/' || pathOnly === '/index.html') {
          const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''
          req.url = `/index.android.html${qs}`
        }
        next()
      })
    },
    closeBundle() {
      const from = join(root, outDir, 'index.android.html')
      const to = join(root, outDir, 'index.html')
      if (existsSync(from)) {
        renameSync(from, to)
      }
    },
  }
}

export default defineConfig({
  plugins: [
    ...createVuePlugins({
      componentsDirs: [fileURLToPath(new URL('./src/android/components', import.meta.url))],
    }),
    androidHtmlPlugin(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src/android', import.meta.url)),
      '@core': fileURLToPath(new URL('./src/core', import.meta.url)),
    },
  },
  clearScreen: false,
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  server: createServerOptions({port: 5174}),
  build: {
    ...createTauriBuildOptions(),
    outDir,
    emptyOutDir: true,
    rollupOptions: {
      input: fileURLToPath(new URL('./index.android.html', import.meta.url)),
    },
  },
  root,
})
