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
      // 兼容中转默认对齐 OpenAI Videos API
      sizes: ['1280x720', '720x1280', '1792x1024', '1024x1792'],
      durationMode: 'seconds',
      durationOptions: [4, 8, 12],
      durationDefault: 8,
      createPath: '/videos',
      pollStyle: 'openai-content',
    },
  }
}
