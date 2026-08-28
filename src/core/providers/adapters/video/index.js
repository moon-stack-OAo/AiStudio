import {resolveProfile} from '../../resolveProfile'
import * as agnes from './agnes'
import * as openai from './openai'
import * as xai from './xai'

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

export async function prepareCreateVideoJob(provider, options, deps) {
  return getCreateAdapter(provider).prepareCreate(provider, options, deps)
}

export function preparePollVideoJob(provider, jobId, deps) {
  return getPollAdapter(provider).preparePoll(provider, jobId, deps)
}

/** 完成后是否需要补拉 /content（xAI / Agnes 否） */
export function shouldFetchVideoContent(provider) {
  if (provider?.provider === 'xai') return false
  const id = resolveProfile(provider)
  return id !== 'agnes' && id !== 'xai'
}
