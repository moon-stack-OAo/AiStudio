import {defineConfig} from 'vite'
import vue from '@vitejs/plugin-vue'
import {fileURLToPath, URL} from 'node:url'
import {Readable} from 'node:stream'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import {NaiveUiResolver} from 'unplugin-vue-components/resolvers'

// Tauri 开发时由 CLI 注入；普通 `npm run dev` 时为空
const host = process.env.TAURI_DEV_HOST

/** 开发代理拒绝常见云元数据 / 链路本地地址，降低 SSRF 风险 */
const BLOCKED_PROXY_HOSTS = new Set([
  '169.254.169.254',
  'metadata.google.internal',
  'metadata.google',
  'metadata',
  'kubernetes.default',
  'kubernetes.default.svc',
])

function isBlockedProxyHost(hostname) {
  const host = String(hostname || '')
    .trim()
    .toLowerCase()
    .replace(/\.$/, '')
  if (!host) return true
  if (BLOCKED_PROXY_HOSTS.has(host)) return true
  // 链路本地 / 文档示例网段等常见探测目标
  if (host.startsWith('169.254.')) return true
  if (host === '0.0.0.0' || host === '::' || host === '[::]' || host === '::1' || host === '[::1]') {
    return true
  }
  return false
}

function assertSafeProxyTarget(targetUrl) {
  const protocol = String(targetUrl.protocol || '').toLowerCase()
  if (protocol !== 'http:' && protocol !== 'https:') {
    throw new Error('仅允许 http/https 代理目标')
  }
  if (isBlockedProxyHost(targetUrl.hostname)) {
    throw new Error('拒绝代理到受保护/元数据地址')
  }
}

/** 开发态 CORS 代理：/api-proxy/* + Header X-Proxy-Target=真实BaseURL */
function corsProxyPlugin() {
  return {
    name: 'cors-proxy',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api-proxy')) return next()

        // 自定义头会触发预检，需放行 OPTIONS
        if (req.method === 'OPTIONS') {
          res.statusCode = 204
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
          res.setHeader(
            'Access-Control-Allow-Headers',
            req.headers['access-control-request-headers'] ||
              'Authorization, Content-Type, X-Proxy-Target',
          )
          res.end()
          return
        }

        const targetBase = String(req.headers['x-proxy-target'] || '').replace(/\/+$/, '')
        if (!targetBase) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: { message: '缺少 X-Proxy-Target（请填写 Base URL）' } }))
          return
        }

        let targetUrl
        try {
          const suffix = req.url.replace(/^\/api-proxy/, '') || '/'
          targetUrl = new URL(suffix, targetBase.endsWith('/') ? targetBase : `${targetBase}/`)
          assertSafeProxyTarget(targetUrl)
        } catch (e) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(
            JSON.stringify({
              error: { message: e?.message || '无效的 Base URL' },
            }),
          )
          return
        }

        const chunks = []
        for await (const chunk of req) chunks.push(chunk)
        const body = Buffer.concat(chunks)

        const headers = { ...req.headers }
        delete headers['host']
        delete headers['origin']
        delete headers['referer']
        delete headers['x-proxy-target']
        delete headers['content-length']
        headers.host = targetUrl.host

        try {
          const upstream = await fetch(targetUrl, {
            method: req.method,
            headers,
            body: ['GET', 'HEAD'].includes(req.method || 'GET') ? undefined : body,
          })

          res.statusCode = upstream.status
          upstream.headers.forEach((value, key) => {
            const lower = key.toLowerCase()
            // 去掉 hop-by-hop / 长度头，便于 chunked / SSE 流式转发
            if (['content-encoding', 'transfer-encoding', 'content-length', 'connection'].includes(lower)) {
              return
            }
            res.setHeader(key, value)
          })
          // 同源返回，浏览器不再受目标站 CORS 限制
          res.setHeader('Access-Control-Allow-Origin', '*')

          if (!upstream.body) {
            res.end()
            return
          }

          // 流式 pipe，避免 arrayBuffer 整包缓冲导致 SSE 无法推送
          const nodeStream = Readable.fromWeb(upstream.body)
          const onClose = () => {
            nodeStream.destroy()
          }
          req.on('close', onClose)
          nodeStream.on('error', () => {
            req.off('close', onClose)
            if (!res.writableEnded) res.destroy()
          })
          nodeStream.on('end', () => {
            req.off('close', onClose)
          })
          nodeStream.pipe(res)
        } catch (error) {
          if (res.headersSent) {
            res.destroy()
            return
          }
          res.statusCode = 502
          res.setHeader('Content-Type', 'application/json')
          res.end(
            JSON.stringify({
              error: {
                message: `代理转发失败: ${error?.message || error}`,
              },
            }),
          )
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [
    vue(),
    AutoImport({
      imports: [
        'vue',
        'vue-router',
        'pinia',
        {
          'naive-ui': [
            'useDialog',
            'useMessage',
            'useNotification',
            'useLoadingBar',
          ],
        },
      ],
    }),
    Components({
      resolvers: [NaiveUiResolver()],
    }),
    corsProxyPlugin(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // 避免 Vite 清屏掩盖 Rust/Tauri 编译错误
  clearScreen: false,
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  server: {
    port: 5173,
    // Tauri 需要固定端口；Web 开发同样可用
    strictPort: true,
    host: host || true,
    hmr: host
      ? {
          protocol: 'ws',
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 忽略 Rust 目录，避免无谓热更新
      ignored: ['**/src-tauri/**'],
    },
  },
  build: {
    // Windows 用 Chromium，macOS/Linux 用 WebKit；非 Tauri 构建走默认目标
    target: process.env.TAURI_ENV_PLATFORM
      ? process.env.TAURI_ENV_PLATFORM === 'windows'
        ? 'chrome105'
        : 'safari13'
      : undefined,
    minify: process.env.TAURI_ENV_DEBUG ? false : 'oxc',
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
})
