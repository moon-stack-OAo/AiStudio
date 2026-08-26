import {createId} from '@/utils/id'

const DB_NAME = 'ai_studio_image_cache'
const STORE_NAME = 'images'
const DB_VERSION = 1

let dbPromise = null

function openDb() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => {
      dbPromise = null
      reject(req.error || new Error('IndexedDB 打开失败'))
    }
  })
  return dbPromise
}

function dataUrlToBlob(dataUrl) {
  const parts = String(dataUrl).split(',')
  if (parts.length < 2) throw new Error('无效的 data URL')
  const header = parts[0]
  const data = parts.slice(1).join(',')
  const mimeMatch = header.match(/data:([^;]+)/)
  const mime = mimeMatch?.[1] || 'image/png'
  const isBase64 = /;base64/i.test(header)
  const binary = isBase64 ? atob(data) : decodeURIComponent(data)
  const len = binary.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new Blob([bytes], { type: mime })
}

async function urlToBlob(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`下载图片失败 HTTP ${res.status}`)
  return res.blob()
}

async function toBlob(image) {
  if (image.type === 'b64' || (typeof image.src === 'string' && image.src.startsWith('data:'))) {
    return dataUrlToBlob(image.src)
  }
  if (image.type === 'url' || (typeof image.src === 'string' && /^https?:/i.test(image.src))) {
    return urlToBlob(image.src)
  }
  throw new Error('无法识别的图片格式')
}

/**
 * 写入 IndexedDB
 * @param {string} id
 * @param {Blob} blob
 * @param {object} meta
 */
export async function putImageBlob(id, blob, meta = {}) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put({
      id,
      blob,
      mime: blob.type || 'image/png',
      createdAt: Date.now(),
      ...meta,
    })
    tx.oncomplete = () => resolve(id)
    tx.onerror = () => reject(tx.error || new Error('写入图片缓存失败'))
  })
}

/**
 * 读取 Blob
 * @param {string} id
 * @returns {Promise<Blob|null>}
 */
export async function getImageBlob(id) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const req = tx.objectStore(STORE_NAME).get(id)
    req.onsuccess = () => {
      const row = req.result
      resolve(row?.blob || null)
    }
    req.onerror = () => reject(req.error || new Error('读取图片缓存失败'))
  })
}

/**
 * 读取为 Object URL（调用方负责 revoke）
 * @param {string} id
 */
export async function getImageObjectUrl(id) {
  const blob = await getImageBlob(id)
  if (!blob) return null
  return URL.createObjectURL(blob)
}

/**
 * 删除单张缓存
 * @param {string} id
 */
export async function deleteImage(id) {
  if (!id) return
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error || new Error('删除图片缓存失败'))
  })
}

/**
 * 批量删除缓存
 * @param {string[]} ids
 */
export async function deleteImages(ids = []) {
  const list = [...new Set(ids.filter(Boolean))]
  if (!list.length) return
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    list.forEach((id) => store.delete(id))
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error || new Error('批量删除图片缓存失败'))
  })
}

/** 清空生图 IndexedDB 缓存库 */
export async function clearImageCache() {
  dbPromise = null
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error || new Error('清空图片缓存失败'))
    req.onblocked = () => resolve()
  })
}

/**
 * 收集条目中的 idb 图片 id
 */
export function collectCacheIds(images = []) {
  return images
    .filter((img) => img?.type === 'idb' && img.id)
    .map((img) => img.id)
}

/**
 * 将接口返回的图片列表缓存到 IndexedDB
 * - b64 / dataURL：直接入库
 * - url：下载后入库；失败则降级保留原始 url，并标记 temporary
 * @param {Array<{type:string, src:string, revisedPrompt?:string}>} images
 */
export async function cacheGeneratedImages(images = []) {
  const results = []
  for (const image of images) {
    const revisedPrompt = image.revisedPrompt || ''
    const isData =
      image.type === 'b64' ||
      (typeof image.src === 'string' && image.src.startsWith('data:'))

    if (isData) {
      try {
        const id = createId('imgc')
        const blob = await toBlob(image)
        await putImageBlob(id, blob, { source: 'b64' })
        results.push({
          id,
          type: 'idb',
          revisedPrompt,
        })
      } catch {
        // 缓存失败时仍保留 dataURL，保证可显示
        results.push({
          type: 'b64',
          src: image.src,
          revisedPrompt,
        })
      }
      continue
    }

    // 远程临时 URL
    try {
      const id = createId('imgc')
      const blob = await toBlob(image)
      await putImageBlob(id, blob, { source: 'url', remoteUrl: image.src })
      results.push({
        id,
        type: 'idb',
        remoteUrl: image.src,
        revisedPrompt,
      })
    } catch {
      results.push({
        type: 'url',
        src: image.src,
        revisedPrompt,
        temporary: true,
      })
    }
  }
  return results
}
