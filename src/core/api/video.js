import {appFetch} from '@core/utils/http'
import {compressImageFile} from '@core/utils/imageCompress'
import {formatNetworkError, proxyHeaders, resolveBaseUrl} from '@core/utils/request'
import {API_TIMEOUT_MS, VIDEO_DOWNLOAD_TIMEOUT_MS} from '@core/utils/constants'
import {
  prepareCreateVideoJob,
  preparePollVideoJob,
  shouldFetchVideoContent,
} from '@core/providers/adapters/video'
import {
  extractApiErrorMessage,
  HTTP_413_HINT,
  httpStatusErrorMessage,
  isAbortLike,
  toAbortError,
  toErrorMessage,
} from './errors.js'
import {authHeaders, createApiClient, fileToDataUrl, getJsonByUrl, postMultipart} from './http.js'

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      const err = new Error('已取消')
      err.name = 'AbortError'
      reject(err)
      return
    }
    const timer = setTimeout(resolve, ms)
    const onAbort = () => {
      clearTimeout(timer)
      const err = new Error('已取消')
      err.name = 'AbortError'
      reject(err)
    }
    signal?.addEventListener?.('abort', onAbort, {once: true})
  })
}

function normalizeVideoJobStatus(raw) {
  const s = String(raw || '').toLowerCase()
  if (s === 'completed' || s === 'done' || s === 'success' || s === 'succeeded') {
    return 'completed'
  }
  if (s === 'failed' || s === 'expired' || s === 'error' || s === 'cancelled' || s === 'canceled') {
    return 'failed'
  }
  if (s === 'queued' || s === 'pending') return 'queued'
  if (s === 'in_progress' || s === 'processing' || s === 'running') return 'in_progress'
  if (!s) return 'queued'
  return 'in_progress'
}

/** 是否像可直链播放的绝对媒体地址（非 API /content 相对路径） */
function isDirectPlayableVideoUrl(url) {
  const s = String(url || '').trim()
  if (!/^https?:\/\//i.test(s)) return false
  // 中转常见：.../videos/{id}/content —— 需鉴权拉取，不能直接给 <video>
  if (/\/videos\/[^/]+\/content\/?$/i.test(s) || /\/v1\/videos\/[^/]+\/content\/?$/i.test(s)) {
    return false
  }
  return true
}

/** 是否像 OpenAI/中转的 content 拉流路径（相对或绝对） */
export function isVideoContentPath(url) {
  const s = String(url || '').trim()
  if (!s) return false
  return /(?:^|\/)(?:v1\/)?videos\/[^/]+\/content\/?$/i.test(s.replace(/^https?:\/\/[^/]+/i, ''))
}

/**
 * 从上游响应提取可播放 URL。
 * 优先绝对直链（xAI vidgen）；避开误导性的 /videos/{id}/content。
 * @param {object} data
 * @returns {string}
 */
export function extractVideoUrl(data) {
  if (!data || typeof data !== 'object') return ''
  // 部分中转会再包一层 data
  const root =
    data.data && typeof data.data === 'object' && !Array.isArray(data.data) ? data.data : data
  const videoObj = root.video && !Array.isArray(root.video) ? root.video : null
  const videoArr0 = Array.isArray(root.video) ? root.video[0] : null

  const candidates = [
    videoObj?.url,
    videoObj?.download_url,
    videoObj?.downloadUrl,
    videoObj?.play_url,
    videoObj?.playUrl,
    root.video_url,
    root.videoUrl,
    videoArr0?.url,
    root.metadata?.url,
    root.output?.url,
    root.result?.url,
    root.url,
    data.video?.url,
    data.url,
    videoObj?.public_url,
    videoObj?.publicUrl,
    root.public_url,
    root.publicUrl,
    videoArr0?.public_url,
  ]
    .map((v) => (v == null ? '' : String(v).trim()))
    .filter(Boolean)

  // 1) 绝对直链（可给 <video src>）
  const direct = candidates.find((u) => isDirectPlayableVideoUrl(u))
  if (direct) return direct

  // 2) 任意绝对 http(s)（含 /content，后续由 ensure 拉 blob）
  const absolute = candidates.find((u) => /^https?:\/\//i.test(u))
  if (absolute) return absolute

  // 3) 相对路径（如 /v1/videos/{id}/content）
  return candidates[0] || ''
}

/** 粗检是否像 mp4（....ftyp）；过严会误伤，仅作辅助提示 */
function looksLikeMp4(buf) {
  if (!buf || buf.byteLength < 8) return false
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  return u8[4] === 0x66 && u8[5] === 0x74 && u8[6] === 0x79 && u8[7] === 0x70
}

/**
 * 用 appFetch 拉取远程视频并转为强制 video/mp4 的 blob: URL。
 * WebView2 对空/octet-stream MIME 的 blob 常直接 @error。
 * @param {string} url
 * @param {AbortSignal} [signal]
 * @returns {Promise<string>} blob: URL
 */
export async function materializeRemoteVideoUrl(url, signal) {
  const src = String(url || '').trim()
  if (!src) throw new Error('缺少视频地址')
  if (src.startsWith('blob:') || src.startsWith('data:')) return src
  if (!/^https?:\/\//i.test(src)) throw new Error('不支持的视频地址')

  const downloadTimeout = Math.max(API_TIMEOUT_MS, VIDEO_DOWNLOAD_TIMEOUT_MS)

  let res
  try {
    res = await appFetch(src, {
      method: 'GET',
      signal,
      connectTimeout: downloadTimeout,
    })
  } catch (error) {
    if (isAbortLike(error, signal)) throw toAbortError()
    throw new Error(formatNetworkError(error, false) || toErrorMessage(error, '下载视频失败'))
  }
  if (!res.ok) {
    throw new Error(
      httpStatusErrorMessage(res.status, `HTTP ${res.status}`) || `HTTP ${res.status}`,
    )
  }

  let buf
  try {
    buf = await res.arrayBuffer()
  } catch (error) {
    if (isAbortLike(error, signal)) throw toAbortError()
    throw new Error(toErrorMessage(error, '读取视频内容失败'))
  }
  if (!buf || buf.byteLength === 0) {
    throw new Error('视频内容为空')
  }
  // 明显 HTML/文本则拒绝；ftyp 仅作软提示，不强制
  const head = new Uint8Array(buf, 0, Math.min(16, buf.byteLength))
  const headStr = String.fromCharCode(...head).trimStart()
  if (headStr.startsWith('<') || headStr.toLowerCase().startsWith('<!doctype')) {
    throw new Error('下载到的不是视频文件')
  }
  if (!looksLikeMp4(buf) && buf.byteLength < 64) {
    throw new Error('视频内容过短或格式异常')
  }

  const blob = new Blob([buf], {type: 'video/mp4'})
  return URL.createObjectURL(blob)
}

/**
 * 把相对/绝对的 /videos/{id}/content 解析成可请求地址。
 * @param {string} url
 * @param {string} [baseUrl]
 */
function resolveVideoContentUrl(url, baseUrl) {
  const src = String(url || '').trim()
  if (!src) return ''
  if (/^https?:\/\//i.test(src)) return src
  const base = String(baseUrl || '').replace(/\/+$/, '')
  if (!base) return src
  if (src.startsWith('/')) return `${base}${src}`
  return `${base}/${src}`
}

/**
 * 完成态规范化播放地址：
 * - 绝对直链（vidgen 等）→ 保留 https，供 <video> 直连
 * - /videos/{id}/content（中转常见）→ 带鉴权拉成 blob:
 * @param {VideoJob} job
 * @param {AbortSignal} [signal]
 * @param {ProviderSettings} [provider]
 * @returns {Promise<VideoJob>}
 */
export async function ensureJobVideoMaterialized(job, signal, provider) {
  if (!job || job.status !== 'completed') return job
  let src = String(job.videoUrl || '').trim()
  if (!src) return job
  if (src.startsWith('blob:') || src.startsWith('data:')) return job

  // 相对 content 路径：拼上 baseUrl
  if (isVideoContentPath(src) || src.startsWith('/')) {
    src = resolveVideoContentUrl(src, provider?.baseUrl)
  }

  // 可直链播放的绝对地址：保留 https
  if (isDirectPlayableVideoUrl(src)) {
    job.remoteVideoUrl = src
    job.videoUrl = src
    job.needsMaterialize = false
    if (job.errorMessage === '视频已生成但本地加载失败') {
      job.errorMessage = undefined
    }
    return job
  }

  // /content 或其它需鉴权地址：拉成 blob
  if (/^https?:\/\//i.test(src) && provider?.baseUrl) {
    try {
      // 若是本 API 的 content 路径，走与 OpenAI 相同的鉴权下载
      if (isVideoContentPath(src) && job.jobId) {
        const blobUrl = await fetchOpenAiVideoContentUrl(provider, job.jobId, signal)
        job.remoteVideoUrl = src
        job.videoUrl = blobUrl
        job.needsMaterialize = false
        return job
      }
      const blobUrl = await materializeRemoteVideoUrl(src, signal)
      job.remoteVideoUrl = isDirectPlayableVideoUrl(src) ? src : job.remoteVideoUrl || ''
      job.videoUrl = blobUrl
      job.needsMaterialize = false
      return job
    } catch (e) {
      if (e?.name === 'AbortError') throw e
      job.videoUrl = src
      job.remoteVideoUrl = job.remoteVideoUrl || src
      job.needsMaterialize = true
      job.errorMessage = toErrorMessage(e, '视频已生成但本地加载失败')
      return job
    }
  }

  // 仍是相对路径且无法解析
  if (!/^https?:\/\//i.test(src)) {
    job.errorMessage = job.errorMessage || `无法解析视频地址: ${src}`
    job.needsMaterialize = true
  }
  return job
}

function extractVideoJobId(data) {
  if (!data || typeof data !== 'object') return ''
  // Agnes：优先 video_id；xAI：优先 request_id。泛化 id 放最后，避免抢错字段
  return String(
    data.video_id ||
      data.videoId ||
      data.request_id ||
      data.requestId ||
      data.job_id ||
      data.jobId ||
      data.task_id ||
      data.taskId ||
      data.id ||
      '',
  )
}

function buildNormalizedVideoJob(data, fallbackId = '') {
  const jobId = extractVideoJobId(data) || String(fallbackId || '')
  const status = normalizeVideoJobStatus(data?.status)
  const progressRaw = data?.progress ?? data?.percent ?? data?.percentage
  const progress =
    typeof progressRaw === 'number' && Number.isFinite(progressRaw) ? progressRaw : undefined
  const videoUrl = extractVideoUrl(data)
  let errorMessage = ''
  if (status === 'failed') {
    errorMessage =
      extractApiErrorMessage(data?.error) ||
      extractApiErrorMessage(data) ||
      (data?.status === 'expired' ? '任务已过期' : '') ||
      '视频生成失败'
  }
  return {
    jobId,
    status,
    progress,
    videoUrl: videoUrl || undefined,
    errorMessage: errorMessage || undefined,
    raw: data,
  }
}

async function fetchOpenAiVideoContentUrl(provider, jobId, signal) {
  const useCorsProxy = Boolean(provider.useCorsProxy)
  const baseUrl = resolveBaseUrl(provider.baseUrl, useCorsProxy)
  let res
  try {
    res = await appFetch(`${baseUrl}/videos/${encodeURIComponent(jobId)}/content`, {
      method: 'GET',
      headers: proxyHeaders(provider.baseUrl, useCorsProxy, authHeaders(provider.apiKey)),
      signal,
      connectTimeout: API_TIMEOUT_MS,
    })
  } catch (error) {
    if (isAbortLike(error, signal)) throw toAbortError()
    throw new Error(formatNetworkError(error, useCorsProxy) || toErrorMessage(error))
  }
  if (!res.ok) {
    let message = `HTTP ${res.status}`
    try {
      const text = await res.text()
      try {
        message = extractApiErrorMessage(JSON.parse(text)) || message
      } catch {
        if (text?.trim()) message = text.trim().slice(0, 300)
      }
    } catch {
      // ignore
    }
    throw new Error(httpStatusErrorMessage(res.status, message) || message)
  }
  const blob = await res.blob()
  if (!blob || blob.size === 0) {
    throw new Error('视频内容为空')
  }
  return URL.createObjectURL(blob)
}

function isHttp413Error(error) {
  const status = error?.response?.status ?? error?.status
  if (status === 413) return true
  const msg = String(error?.message || '')
  return /HTTP\s*413|payload too large|request entity too large/i.test(msg)
}

async function postPreparedVideoCreate(provider, prepared, signal) {
  if (prepared.transport === 'multipart') {
    return postMultipart(provider, prepared.path, prepared.form, signal, API_TIMEOUT_MS)
  }
  const client = createApiClient(provider)
  const {data} = await client.post(prepared.path, prepared.body, {signal})
  return data
}

export async function createVideoJob(provider, options = {}) {
  if (!provider?.baseUrl) throw new Error('请先填写 Base URL')
  const {signal} = options
  const deps = {compressImageFile, fileToDataUrl}
  let prepared = await prepareCreateVideoJob(provider, options, deps)

  let data
  try {
    data = await postPreparedVideoCreate(provider, prepared, signal)
  } catch (error) {
    if (signal?.aborted || isAbortLike(error, signal)) throw toAbortError()
    // 图生（JSON / multipart）413：更激进压缩后重试一次
    if (
      options.mode === 'img2video' &&
      options.imageFile &&
      !options._aggressiveCompress &&
      isHttp413Error(error)
    ) {
      prepared = await prepareCreateVideoJob(
        provider,
        {...options, _aggressiveCompress: true},
        deps,
      )
      try {
        data = await postPreparedVideoCreate(provider, prepared, signal)
      } catch (retryErr) {
        if (signal?.aborted || isAbortLike(retryErr, signal)) throw toAbortError()
        if (isHttp413Error(retryErr)) {
          throw new Error(HTTP_413_HINT)
        }
        throw retryErr
      }
    } else if (isHttp413Error(error)) {
      throw new Error(HTTP_413_HINT)
    } else {
      throw error
    }
  }

  const job = buildNormalizedVideoJob(data)
  if (prepared.requireJobId && !job.jobId) {
    throw new Error(prepared.missingJobIdMessage || '未返回任务 ID')
  }
  if (prepared.defaultQueuedIfEmpty && (!job.status || job.status === 'queued')) {
    job.status = 'queued'
  }
  return job
}

/**
 * 查询视频任务状态；OpenAI 兼容完成且无 url 时尝试拉取 /content。
 * @param {ProviderSettings} provider
 * @param {string} jobId
 * @param {object} [options]
 * @param {AbortSignal} [options.signal]
 * @param {boolean} [options.fetchContent=true] 是否允许补拉视频二进制内容
 * @returns {Promise<VideoJob>}
 */
export async function getVideoJob(provider, jobId, options = {}) {
  const id = String(jobId || '').trim()
  if (!id) throw new Error('缺少任务 ID')
  if (!provider?.baseUrl) throw new Error('请先填写 Base URL')

  const {signal, fetchContent = true} = options
  const prepared = preparePollVideoJob(provider, id, {resolveBaseUrl})

  let data
  if (prepared.style === 'agnesapi') {
    data = await getJsonByUrl(provider, prepared.url, signal)
  } else {
    const client = createApiClient(provider)
    ;({data} = await client.get(prepared.path, {signal}))
  }

  const job = buildNormalizedVideoJob(data, id)

  const allowContent = fetchContent && prepared.fetchContent && shouldFetchVideoContent(provider)

  if (allowContent && job.status === 'completed' && !job.videoUrl) {
    try {
      job.videoUrl = await fetchOpenAiVideoContentUrl(provider, id, signal)
    } catch (e) {
      if (e?.name === 'AbortError') throw e
      job.errorMessage = toErrorMessage(e, '下载视频内容失败')
    }
  }

  // 完成态：直链保留 https；/content 相对路径带鉴权拉成 blob
  if (job.status === 'completed' && job.videoUrl) {
    await ensureJobVideoMaterialized(job, signal, provider)
  }

  // 完成但没有任何 url：对 content 型 API 再尝试拉二进制
  if (job.status === 'completed' && !job.videoUrl && job.jobId && provider?.baseUrl) {
    try {
      job.videoUrl = await fetchOpenAiVideoContentUrl(provider, job.jobId, signal)
      job.needsMaterialize = false
    } catch (e) {
      if (e?.name === 'AbortError') throw e
      // 保留原错误；上层会标失败
      if (!job.errorMessage) job.errorMessage = toErrorMessage(e, '下载视频内容失败')
    }
  }

  return job
}

/** 视频任务默认轮询超时（30 分钟） */
export const VIDEO_JOB_DEFAULT_TIMEOUT_MS = 30 * 60 * 1000

/**
 * 轮询直至任务完成或失败。
 * @param {ProviderSettings} provider
 * @param {string} jobId
 * @param {object} [options]
 * @param {AbortSignal} [options.signal]
 * @param {(job: VideoJob) => void} [options.onProgress]
 * @param {number} [options.intervalMs=5000] 轮询间隔（至少 1000ms）
 * @param {number} [options.timeoutMs=VIDEO_JOB_DEFAULT_TIMEOUT_MS] 总超时；<=0 表示不限
 * @param {boolean} [options.fetchContent=true]
 * @returns {Promise<VideoJob>}
 */
export async function waitVideoJob(provider, jobId, options = {}) {
  const {
    signal,
    onProgress,
    intervalMs = 5000,
    timeoutMs = VIDEO_JOB_DEFAULT_TIMEOUT_MS,
    fetchContent = true,
  } = options
  const interval = Math.max(1000, Number(intervalMs) || 5000)
  const limit =
    typeof timeoutMs === 'number' && Number.isFinite(timeoutMs)
      ? timeoutMs
      : VIDEO_JOB_DEFAULT_TIMEOUT_MS
  const startedAt = Date.now()

  while (true) {
    if (signal?.aborted) {
      const err = new Error('已取消')
      err.name = 'AbortError'
      throw err
    }
    if (limit > 0 && Date.now() - startedAt >= limit) {
      const err = new Error('视频生成超时，可稍后在会话中恢复轮询')
      err.name = 'TimeoutError'
      err.code = 'VIDEO_JOB_TIMEOUT'
      throw err
    }
    const job = await getVideoJob(provider, jobId, {signal, fetchContent})
    onProgress?.(job)
    if (job.status === 'completed' || job.status === 'failed') {
      return job
    }
    await sleep(interval, signal)
  }
}

/**
 * 创建视频任务并等待完成（或立即返回已终态结果）。
 * @param {ProviderSettings} provider
 * @param {object} [options] 同 createVideoJob，另含轮询选项
 * @param {AbortSignal} [options.signal]
 * @param {(job: VideoJob) => void} [options.onProgress]
 * @param {number} [options.intervalMs]
 * @returns {Promise<VideoJob>}
 */
export async function generateVideo(provider, options = {}) {
  const {signal, onProgress, intervalMs, timeoutMs, ...createOpts} = options
  const created = await createVideoJob(provider, {...createOpts, signal})
  onProgress?.(created)
  if (created.status === 'completed' || created.status === 'failed') {
    if (created.status === 'completed' && !created.videoUrl && shouldFetchVideoContent(provider)) {
      return waitVideoJob(provider, created.jobId, {signal, onProgress, intervalMs, timeoutMs})
    }
    // 创建接口直接返回完成时也规范化播放地址
    if (created.status === 'completed' && created.videoUrl) {
      await ensureJobVideoMaterialized(created, signal, provider)
    }
    return created
  }
  if (!created.jobId) throw new Error('未返回任务 ID')
  return waitVideoJob(provider, created.jobId, {signal, onProgress, intervalMs, timeoutMs})
}
