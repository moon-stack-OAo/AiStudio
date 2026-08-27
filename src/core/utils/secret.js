/** 本地密钥混淆前缀（非服务端级加密，仅避免明文落盘） */
const PREFIX = 'enc:v1:'
const KEY = 'AiStudioLocalProtectV1'

function xorBytes(input, key) {
  const out = new Uint8Array(input.length)
  for (let i = 0; i < input.length; i += 1) {
    out[i] = input[i] ^ key.charCodeAt(i % key.length)
  }
  return out
}

function bytesToBase64(bytes) {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function base64ToBytes(b64) {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

/** 混淆后写入 localStorage；已是密文则原样返回 */
export function encryptSecret(plain) {
  if (plain == null || plain === '') return ''
  const text = String(plain)
  if (text.startsWith(PREFIX)) return text
  const encoded = new TextEncoder().encode(text)
  return PREFIX + bytesToBase64(xorBytes(encoded, KEY))
}

/** 读取时还原；兼容历史明文 */
export function decryptSecret(value) {
  if (value == null || value === '') return ''
  const text = String(value)
  if (!text.startsWith(PREFIX)) return text
  try {
    const raw = xorBytes(base64ToBytes(text.slice(PREFIX.length)), KEY)
    return new TextDecoder().decode(raw)
  } catch {
    return ''
  }
}
