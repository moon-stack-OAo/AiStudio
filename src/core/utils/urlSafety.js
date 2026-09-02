/**
 * URL 安全策略（纯 JS，可被浏览器运行时与 Vite Node 配置共用）。
 * 硬拦：云元数据 / 链路本地 / 明显 SSRF 靶点。
 * 放行：localhost、RFC1918（产品需支持本地/内网中转）。
 */

/** @type {ReadonlySet<string>} */
export const BLOCKED_FETCH_HOSTS = new Set([
  '169.254.169.254',
  'metadata.google.internal',
  'metadata.google',
  'metadata',
  'kubernetes.default',
  'kubernetes.default.svc',
  // AWS IMDS IPv6
  'fd00:ec2::254',
])

/**
 * @param {string} hostname
 * @returns {string}
 */
export function normalizeHostname(hostname) {
  return String(hostname || '')
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '')
}

/**
 * @param {string} host
 */
function isDottedIpv4(host) {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)
}

/**
 * 解析 IPv4 映射的 IPv6（::ffff:a.b.c.d 或 ::ffff:xxxx:yyyy）。
 * @param {string} host
 * @returns {string|null}
 */
function extractIpv4Mapped(host) {
  const dotted = host.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i)
  if (dotted) return dotted[1]
  const hex = host.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i)
  if (!hex) return null
  const hi = parseInt(hex[1], 16)
  const lo = parseInt(hex[2], 16)
  if (!Number.isFinite(hi) || !Number.isFinite(lo)) return null
  return `${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`
}

/**
 * 危险 host（硬拦）。不含 127.0.0.1 / RFC1918。
 * @param {string} hostname
 * @returns {boolean}
 */
export function isBlockedFetchHost(hostname) {
  const host = normalizeHostname(hostname)
  if (!host) return true
  if (BLOCKED_FETCH_HOSTS.has(host)) return true
  if (host.startsWith('169.254.')) return true
  if (host === '0.0.0.0' || host === '::' || host === '::1') return true

  const mapped = extractIpv4Mapped(host)
  if (mapped && (mapped === '169.254.169.254' || mapped.startsWith('169.254.'))) {
    return true
  }

  return false
}

/**
 * 校验 http(s) URL 目标是否允许请求/代理。
 * @param {URL} url
 * @param {{ blockedMessage?: string, protocolMessage?: string }} [options]
 */
export function assertSafeHttpUrl(url, options = {}) {
  const protocol = String(url?.protocol || '').toLowerCase()
  if (protocol !== 'http:' && protocol !== 'https:') {
    throw new Error(options.protocolMessage || '仅允许 http/https 请求')
  }
  if (isBlockedFetchHost(url.hostname)) {
    throw new Error(options.blockedMessage || '拒绝访问云元数据或受保护地址')
  }
}

/**
 * @param {string} host
 */
function isLoopbackHost(host) {
  if (host === 'localhost' || host === '127.0.0.1') return true
  if (host.startsWith('127.')) return true
  return false
}

/**
 * @param {string} host
 */
function isPrivateIpv4(host) {
  if (!isDottedIpv4(host)) return false
  const parts = host.split('.').map((x) => Number(x))
  if (parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false
  const [a, b] = parts
  if (a === 10) return true
  if (a === 192 && b === 168) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  return false
}

/**
 * 非公网 / 明文 http 的风险提示（warn 级，不硬拦）。
 * @param {string|URL} input
 * @returns {string|null}
 */
export function warnUnsafeUrl(input) {
  let url
  try {
    if (input instanceof URL) {
      url = input
    } else {
      const raw = String(input || '').trim()
      if (!raw || raw.startsWith('/') || raw.startsWith('blob:') || raw.startsWith('data:')) {
        return null
      }
      url = new URL(raw)
    }
  } catch {
    return null
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null

  const host = normalizeHostname(url.hostname)
  const reasons = []

  if (url.protocol === 'http:') {
    reasons.push('使用明文 HTTP，密钥可能被窃听')
  }
  if (isLoopbackHost(host)) {
    reasons.push('指向本机地址，仅适合本地中转调试')
  } else if (isPrivateIpv4(host)) {
    reasons.push('指向私有网段（RFC1918），请确认中转可信')
  }

  if (!reasons.length) return null
  return `安全提示：${reasons.join('；')}`
}
