import {resolveProfile} from '../../resolveProfile'
import * as agnes from './agnes'
import * as openai from './openai'
import * as xai from './xai'

/**
 * @typedef {object} VideoCreatePrepareResult
 * @property {'json'|'multipart'} transport
 * @property {string} path
 * @property {object} [body]
 * @property {FormData} [form]
 * @property {boolean} [requireJobId] 创建响应必须带任务 ID
 * @property {string} [missingJobIdMessage]
 * @property {boolean} [defaultQueuedIfEmpty]
 *
 * @typedef {object} VideoPollPrepareResult
 * @property {'status'|'agnesapi'|string} style
 * @property {string} [path] style=status 时相对路径
 * @property {string} [url] style=agnesapi 时绝对 URL
 * @property {boolean} [fetchContent] 完成后是否允许补拉 /content
 * @property {string} [contentPath]
 */

/**
 * 创建任务分发优先级：xai → Agnes → OpenAI（与历史一致）
 * resolveProfile 已优先 Agnes；此处对 builtin xai 再显式优先。
 */
function getCreateAdapter(provider) {
  if (provider?.provider === 'xai') return xai
  const id = resolveProfile(provider)
  if (id === 'agnes') return agnes
  if (id === 'xai') return xai
  return openai
}

function getPollAdapter(provider) {
  const id = resolveProfile(provider)
  if (id === 'agnes') return agnes
  if (id === 'xai') return xai
  return openai
}

/**
 * 按 profile 组装创建视频任务请求（不发起网络）。
 * @param {object} provider
 * @param {object} options 含 prompt、mode、imageFile、seconds/duration、size、aspectRatio 等
 * @param {{ compressImageFile: Function, fileToDataUrl?: Function }} deps
 * @returns {Promise<VideoCreatePrepareResult>}
 */
export async function prepareCreateVideoJob(provider, options, deps) {
  return getCreateAdapter(provider).prepareCreate(provider, options, deps)
}

/**
 * 按 profile 组装轮询请求描述（不发起网络）。
 * @param {object} provider
 * @param {string} jobId
 * @param {{ resolveBaseUrl?: Function }} [deps] Agnes 轮询需要 resolveBaseUrl
 * @returns {VideoPollPrepareResult}
 */
export function preparePollVideoJob(provider, jobId, deps) {
  return getPollAdapter(provider).preparePoll(provider, jobId, deps)
}

/**
 * 完成后是否需要补拉 /content（xAI / Agnes 否）
 * @param {object} provider
 * @returns {boolean}
 */
export function shouldFetchVideoContent(provider) {
  if (provider?.provider === 'xai') return false
  const id = resolveProfile(provider)
  return id !== 'agnes' && id !== 'xai'
}
