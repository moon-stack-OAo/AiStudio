import {compressImageFile} from '@core/utils/imageCompress'
import {API_TIMEOUT_MS} from '@core/utils/constants'
import {prepareEditImage, prepareGenerateImage} from '@core/providers/adapters/image'
import {createApiClient, fileToDataUrl, postMultipart} from './http.js'

/**
 * 文生图：经 adapter 组装请求后 POST，并归一化为可展示结果列表。
 * @param {ProviderSettings} provider
 * @param {object} options
 * @param {string} options.prompt
 * @param {number} [options.n]
 * @param {string} [options.size] 如 1024x1024
 * @param {string} [options.quality]
 * @param {string} [options.aspectRatio]
 * @param {'b64_json'|'url'|string} [options.responseFormat]
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<ImageResult[]>}
 */
export async function generateImage(provider, options) {
  const {signal} = options
  const prepared = await prepareGenerateImage(provider, options)
  const client = createApiClient(provider)
  const {data} = await client.post(prepared.path, prepared.body, {
    signal,
    timeout: prepared.timeout || API_TIMEOUT_MS,
  })
  return normalizeImageResponse(data)
}

/**
 * 图生图 / 编辑：multipart（OpenAI edits）或 JSON（如 Agnes）。
 * @param {ProviderSettings} provider
 * @param {object} options
 * @param {string} options.prompt
 * @param {File|Blob} options.imageFile 参考图
 * @param {number} [options.n]
 * @param {string} [options.size]
 * @param {string} [options.aspectRatio]
 * @param {'b64_json'|'url'|string} [options.responseFormat]
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<ImageResult[]>}
 */
export async function editImage(provider, options) {
  const {signal} = options
  const prepared = await prepareEditImage(provider, options, {
    compressImageFile,
    fileToDataUrl,
  })

  if (prepared.transport === 'multipart') {
    const data = await postMultipart(
      provider,
      prepared.path,
      prepared.form,
      signal,
      prepared.timeout || API_TIMEOUT_MS,
    )
    return normalizeImageResponse(data)
  }

  const client = createApiClient(provider)
  const {data} = await client.post(prepared.path, prepared.body, {
    signal,
    timeout: prepared.timeout || API_TIMEOUT_MS,
  })
  return normalizeImageResponse(data)
}

function normalizeImageResponse(data) {
  const list = data?.data || []
  return list.map((item) => {
    if (item.b64_json) {
      return {
        type: 'b64',
        src: `data:image/png;base64,${item.b64_json}`,
        revisedPrompt: item.revised_prompt || '',
      }
    }
    return {
      type: 'url',
      src: item.url,
      revisedPrompt: item.revised_prompt || '',
    }
  })
}

/**
 * 将本地文件转为 data URL，供 UI 预览。
 * @param {File|Blob} file
 * @returns {Promise<string>} data URL
 */
export async function fileToPreview(file) {
  return fileToDataUrl(file)
}
