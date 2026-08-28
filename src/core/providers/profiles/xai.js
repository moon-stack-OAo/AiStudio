import {API_TIMEOUT_MS} from '@core/utils/constants'

export function supportsXaiImageQuality(provider) {
  const model = String(provider?.imageModel || '').toLowerCase()
  return model.includes('imagine-image-2') || model.includes('2.0')
}

export function getXaiCapabilities(provider) {
  return {
    id: 'xai',
    chat: {
      style: 'openai-compatible',
    },
    image: {
      sizeMode: 'aspectOnly',
      sizes: undefined,
      ratios: ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9'],
      supportsN: true,
      supportsQuality: supportsXaiImageQuality(provider),
      preferResponseFormat: 'b64_json',
      timeoutMs: API_TIMEOUT_MS,
      editVia: 'edits-json',
    },
    video: {
      sizeMode: 'aspectOnly',
      ratios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
      durationMode: 'duration',
      durationMin: 1,
      durationMax: 15,
      durationDefault: 8,
      createPath: '/videos/generations',
      pollStyle: 'openai-status',
    },
  }
}
