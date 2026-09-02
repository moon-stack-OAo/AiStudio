/**
 * OpenAI 兼容 API 客户端：对话、生图、视频任务与连通性探测。
 * 按 provider 配置鉴权与代理；桌面端走 Tauri HTTP，浏览器开发态可走 CORS 代理。
 *
 * @typedef {object} ProviderSettings
 * @property {string} [id] 本地提供商 ID
 * @property {string} [name] 显示名
 * @property {string} baseUrl API Base URL（通常含 /v1）
 * @property {string} [apiKey] API Key
 * @property {string} [chatModel] 对话模型
 * @property {string} [imageModel] 生图模型
 * @property {string} [videoModel] 视频模型
 * @property {string} [provider] 内置类型：openai | xai | openai-compatible 等
 * @property {boolean} [builtin] 是否内置预设
 * @property {boolean} [useCorsProxy] 浏览器开发态是否走 Vite CORS 代理
 *
 * @typedef {object} ChatMessage
 * @property {'system'|'user'|'assistant'|string} role
 * @property {string|Array<object>} content
 *
 * @typedef {object} ImageResult
 * @property {'b64'|'url'} type
 * @property {string} src 可展示的 data URL 或远程 URL
 * @property {string} [revisedPrompt]
 *
 * @typedef {object} VideoJob
 * @property {string} jobId
 * @property {'queued'|'in_progress'|'completed'|'failed'|string} status
 * @property {number} [progress]
 * @property {string} [videoUrl]
 * @property {string} [remoteVideoUrl] 原始 http(s) 地址，供 blob 失效后重新加载
 * @property {boolean} [needsMaterialize] materialize 失败时为 true，UI 可提示重新加载
 * @property {string} [errorMessage]
 * @property {object} [raw] 上游原始响应
 */

export {
  getCapabilities,
  resolveProfile,
  supportsImageQuality,
  isAgnesProvider,
  isAgnesImage21,
  isAgnesVideoFlash,
  normalizeAgnesVideoSize,
  normalizeAgnesImageSize20,
  normalizeAgnesImageSize,
  normalizeAgnesImageRatio,
  buildAgnesImageSizeFields,
} from '@core/providers'

export {
  HTTP_413_HINT,
  isAbortLike,
  toAbortError,
  sanitizeErrorText,
  extractApiErrorMessage,
  httpStatusErrorMessage,
  toErrorMessage,
} from './errors.js'

export {
  authHeaders,
  buildAxiosConfig,
  createApiClient,
  fileToDataUrl,
  postMultipart,
  getJsonByUrl,
} from './http.js'

export {listProviderModels, testProviderConnection} from './probe.js'

export {chatCompletions, streamChatCompletions} from './chat.js'

export {generateImage, editImage, fileToPreview} from './image.js'

export {
  isVideoContentPath,
  extractVideoUrl,
  materializeRemoteVideoUrl,
  ensureJobVideoMaterialized,
  createVideoJob,
  getVideoJob,
  VIDEO_JOB_DEFAULT_TIMEOUT_MS,
  waitVideoJob,
  generateVideo,
} from './video.js'
