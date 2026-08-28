import {API_TIMEOUT_MS} from '@core/utils/constants'

export function getOpenAiCompatibleCapabilities() {
  return {
    id: 'openai-compatible',
    chat: {
      style: 'openai-compatible',
    },
    image: {
      sizeMode: 'pixels',
      sizes: undefined,
      supportsN: true,
      // 自定义中转一律不传 quality（与 supportsImageQuality 一致）
      supportsQuality: false,
      preferResponseFormat: 'b64_json',
      timeoutMs: API_TIMEOUT_MS,
      editVia: 'edits-multipart',
    },
    video: {
      sizeMode: 'pixels',
      durationMode: 'seconds',
      durationOptions: [4, 8, 12],
      durationDefault: 8,
      createPath: '/videos',
      pollStyle: 'openai-content',
    },
  }
}
