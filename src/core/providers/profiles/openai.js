import {API_TIMEOUT_MS} from '@core/utils/constants'

export function getOpenAiCapabilities() {
  return {
    id: 'openai',
    chat: {
      style: 'openai-compatible',
    },
    image: {
      sizeMode: 'pixels',
      sizes: undefined,
      supportsN: true,
      supportsQuality: true,
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
