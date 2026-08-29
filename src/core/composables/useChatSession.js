import {computed, onActivated, onBeforeUnmount, onMounted, ref, watch} from 'vue'
import {useDialog, useMessage} from 'naive-ui'
import {useChatStore} from '@core/stores/chat'
import {useSettingsStore} from '@core/stores/settings'
import {streamChatCompletions, toErrorMessage} from '@core/api/client'
import {useCopyFeedback} from '@core/composables/useCopyFeedback'
import {useScrollToBottom} from '@core/composables/useScrollToBottom'
import {useGenerationRuntime} from '@core/composables/useGenerationRuntime'
import {trimChatMessages} from '@core/utils/chatContext'
import {chatGeneration} from '@core/runtime/generationRuntime'

/**
 * 格式化上下文裁剪提示文案。
 * @param {{
 *   truncated: boolean,
 *   truncatedByChars?: boolean,
 *   nearLimit: boolean,
 *   nearCharLimit?: boolean,
 *   totalTurns: number,
 *   keptTurns?: number,
 *   maxTurns: number,
 *   keptChars?: number,
 *   totalChars?: number,
 *   maxChars?: number,
 * }} info
 * @param {'full' | 'short'} variant
 * @returns {string}
 */
export function formatChatContextHint(info, variant = 'full') {
  const {
    totalTurns,
    maxTurns,
    nearLimit,
    nearCharLimit,
    truncated,
    truncatedByChars,
    keptTurns,
    keptChars,
    maxChars,
  } = info
  const kept = keptTurns != null ? keptTurns : maxTurns
  if (truncated) {
    let text = `已裁剪：本次发送最近 ${kept} 轮（共 ${totalTurns} 轮）`
    if (truncatedByChars) {
      text += variant === 'short' ? ' · 已按字符预算裁剪' : '，已按字符预算裁剪'
      if (
        variant === 'full' &&
        keptChars != null &&
        maxChars != null &&
        Number.isFinite(keptChars) &&
        Number.isFinite(maxChars)
      ) {
        text += `（${keptChars} / ${maxChars}）`
      }
    }
    return text
  }
  if (nearLimit && nearCharLimit) {
    const charsPart =
      keptChars != null && maxChars != null ? `${keptChars} / ${maxChars}` : '字符预算'
    return variant === 'short'
      ? `接近上限：${totalTurns} / ${maxTurns} 轮 · ${charsPart}`
      : `上下文接近上限：轮数与字符预算（${totalTurns} / ${maxTurns} 轮，${charsPart}），建议新开会话或提高上限`
  }
  if (nearLimit) {
    return variant === 'short'
      ? `接近上限：${totalTurns} / ${maxTurns} 轮`
      : `上下文接近上限：${totalTurns} / ${maxTurns} 轮，建议新开会话或提高上限`
  }
  if (nearCharLimit) {
    const charsPart =
      keptChars != null && maxChars != null ? `${keptChars} / ${maxChars}` : ''
    return variant === 'short'
      ? charsPart
        ? `接近字符预算：${charsPart}`
        : '接近字符预算'
      : charsPart
        ? `上下文接近字符预算：${charsPart}，建议新开会话或提高上限`
        : '上下文接近字符预算，建议新开会话或提高上限'
  }
  return ''
}

/**
 * 对话会话状态机（与窗体无关）：发送 / SSE 流式、停止、撤回、上下文裁剪 hint、generation runtime。
 * 右键菜单、顶栏更多、breakpoints、SessionHistoryButton、useBackCloseLayer 等留在各端 View。
 *
 * @param {{
 *   contextHintVariant?: 'full' | 'short',
 *   notifyCreateSession?: boolean,
 * }} [options]
 */
export function useChatSession(options = {}) {
  const {contextHintVariant = 'full', notifyCreateSession = false} = options

  const chatStore = useChatStore()
  const settings = useSettingsStore()
  const message = useMessage()
  const dialog = useDialog()
  const {copiedId, copyText} = useCopyFeedback()
  const gen = useGenerationRuntime(chatGeneration)

  const input = ref('')
  const listRef = ref(null)
  const {scheduleScrollToBottom} = useScrollToBottom(listRef)
  const contextHintShown = ref(false)

  /** 流式 UI 更新：合并同帧内的 delta 写入，停止/结束时 flush */
  let streamRaf = 0
  let pendingStreamUpdate = null

  function flushStreamUi() {
    if (streamRaf) {
      cancelAnimationFrame(streamRaf)
      streamRaf = 0
    }
    const pending = pendingStreamUpdate
    pendingStreamUpdate = null
    if (!pending) return
    const {sessionId, messageId, content} = pending
    chatStore.updateMessage(sessionId, messageId, {content, streaming: true}, {persist: false})
  }

  function scheduleStreamUi(sessionId, messageId, content) {
    pendingStreamUpdate = {sessionId, messageId, content}
    if (streamRaf) return
    streamRaf = requestAnimationFrame(flushStreamUi)
  }

  function cancelStreamUiSchedule() {
    if (streamRaf) {
      cancelAnimationFrame(streamRaf)
      streamRaf = 0
    }
    pendingStreamUpdate = null
  }

  const session = computed(() => chatStore.activeSession)
  const provider = computed(() => settings.activeProvider)
  const isStreamingCurrent = computed(() => gen.isCurrent(session.value?.id))

  const contextInfo = computed(() => {
    const msgs = (session.value?.messages || [])
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({role: m.role, content: m.content}))
    const systemPrompt = String(settings.chatSystemPrompt || '').trim()
    const withSystem = systemPrompt
      ? [{role: 'system', content: systemPrompt}, ...msgs]
      : msgs
    return trimChatMessages(withSystem, {
      enabled: settings.chatContextTrimEnabled,
      maxTurns: settings.chatContextMaxTurns,
      maxCharsEnabled: settings.chatContextMaxCharsEnabled,
      maxChars: settings.chatContextMaxChars,
    })
  })

  const contextHint = computed(() => {
    if (!settings.chatContextTrimEnabled && !settings.chatContextMaxCharsEnabled) return ''
    return formatChatContextHint(contextInfo.value, contextHintVariant)
  })

  const sessionTitle = computed(() => session.value?.title || '对话')

  watch(
    () => session.value?.id,
    () => {
      contextHintShown.value = false
      // 切会话时滚到底；停留当前页流式输出时不自动拽底
      scheduleScrollToBottom({force: true})
    },
  )

  function ensureProvider() {
    if (!provider.value?.baseUrl || !provider.value?.apiKey) {
      message.warning('请先在设置中填写 Base URL 和 API Key')
      return false
    }
    if (!provider.value?.chatModel) {
      message.warning('请先设置对话模型')
      return false
    }
    return true
  }

  onMounted(() => {
    scheduleScrollToBottom({force: true})
  })

  onActivated(() => {
    // 仅切回本页时滚到底
    scheduleScrollToBottom({force: true})
  })

  async function send() {
    const text = input.value.trim()
    if (!text || gen.busy || !session.value) return
    if (!ensureProvider()) return

    const sessionId = session.value.id

    input.value = ''
    chatStore.appendMessage(sessionId, {
      role: 'user',
      content: text,
    })

    const rawHistory = session.value.messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({role: m.role, content: m.content}))

    const systemPrompt = String(settings.chatSystemPrompt || '').trim()
    const withSystem = systemPrompt
      ? [{role: 'system', content: systemPrompt}, ...rawHistory]
      : rawHistory

    const trimmed = trimChatMessages(withSystem, {
      enabled: settings.chatContextTrimEnabled,
      maxTurns: settings.chatContextMaxTurns,
      maxCharsEnabled: settings.chatContextMaxCharsEnabled,
      maxChars: settings.chatContextMaxChars,
    })

    if (trimmed.truncated && !contextHintShown.value) {
      let info = `上下文已裁剪：仅发送最近 ${trimmed.keptTurns} 轮（共 ${trimmed.totalTurns} 轮），本地记录仍完整保留`
      if (trimmed.truncatedByChars) info += '；已按字符预算裁剪'
      message.info(info, {duration: 4000})
      contextHintShown.value = true
    } else if (
      (trimmed.nearLimit || trimmed.nearCharLimit) &&
      !trimmed.truncated &&
      !contextHintShown.value
    ) {
      let warnText
      if (trimmed.nearLimit && trimmed.nearCharLimit) {
        warnText = `上下文接近上限（${trimmed.totalTurns} / ${trimmed.maxTurns} 轮，字符 ${trimmed.keptChars} / ${trimmed.maxChars}），建议新开会话`
      } else if (trimmed.nearLimit) {
        warnText = `上下文接近上限（${trimmed.totalTurns} / ${trimmed.maxTurns} 轮），建议新开会话`
      } else {
        warnText = `上下文接近字符预算（${trimmed.keptChars} / ${trimmed.maxChars}），建议新开会话`
      }
      message.warning(warnText, {duration: 3500})
      contextHintShown.value = true
    }

    const payloadMessages = trimmed.messages

    const assistant = chatStore.appendMessage(sessionId, {
      role: 'assistant',
      content: '',
      streaming: true,
    })

    const controller = new AbortController()
    gen.begin(sessionId, controller)

    try {
      await streamChatCompletions(provider.value, {
        messages: payloadMessages,
        temperature: settings.chatTemperature,
        signal: controller.signal,
        onDelta: (_delta, full) => {
          if (controller.signal.aborted) return
          scheduleStreamUi(sessionId, assistant.id, full)
        },
      })
      flushStreamUi()
      const target = chatStore.sessions
        .find((s) => s.id === sessionId)
        ?.messages?.find((m) => m.id === assistant.id)
      if (controller.signal.aborted || target?.stopped) {
        if (!target?.stopped) {
          chatStore.updateMessage(sessionId, assistant.id, {
            streaming: false,
            stopped: true,
            content: target?.content || '',
          })
        }
        return
      }
      chatStore.updateMessage(sessionId, assistant.id, {
        streaming: false,
      })
    } catch (err) {
      flushStreamUi()
      const target = chatStore.sessions
        .find((s) => s.id === sessionId)
        ?.messages?.find((m) => m.id === assistant.id)
      if (target?.stopped) return
      if (
        err?.name === 'AbortError' ||
        controller.signal.aborted ||
        /cancel+ed|已取消/i.test(String(err?.message || ''))
      ) {
        chatStore.updateMessage(sessionId, assistant.id, {
          streaming: false,
          stopped: true,
          content: target?.content || '',
        })
      } else {
        const errText = toErrorMessage(err, '请求失败，请稍后重试')
        // 保留已流式写出的正文，错误单独落在 errorMessage
        chatStore.updateMessage(sessionId, assistant.id, {
          streaming: false,
          content: target?.content || '',
          error: true,
          errorMessage: errText,
        })
        message.error(errText)
      }
    } finally {
      cancelStreamUiSchedule()
      gen.end(sessionId, controller)
    }
  }

  function stop() {
    const sessionId = session.value?.id
    if (!sessionId || !gen.isCurrent(sessionId)) return
    cancelStreamUiSchedule()
    const streamingMsg = session.value?.messages?.find((m) => m.streaming)
    if (streamingMsg) {
      chatStore.updateMessage(sessionId, streamingMsg.id, {
        streaming: false,
        stopped: true,
        content: streamingMsg.content || '',
      })
    }
    gen.abort()
    gen.end(sessionId)
  }

  function selectSession(id) {
    chatStore.setActive(id)
  }

  function createSession() {
    chatStore.createSession()
    if (notifyCreateSession) message.success('已新建会话')
  }

  function removeSession(id) {
    gen.abortIfSession(id)
    chatStore.removeSession(id)
  }

  async function copyMessage(msg) {
    if (msg?.streaming) return
    const ok = await copyText(msg?.id, msg?.content)
    if (!ok) message.error('复制失败')
  }

  async function copyErrorMessage(msg) {
    const text = String(msg?.errorMessage || '请求失败').trim()
    const ok = await copyText(`${msg?.id || 'err'}-error`, text)
    if (!ok) message.error('复制失败')
  }

  function recallMessage(msg) {
    if (!session.value || msg?.role !== 'user' || msg?.streaming) return
    dialog.warning({
      title: '撤回消息',
      content: '将删除此条用户消息，若下一条是对应 AI 回复也会一并删除。确定撤回？',
      positiveText: '撤回',
      negativeText: '取消',
      onPositiveClick: () => {
        const sessionId = session.value.id
        if (gen.isCurrent(sessionId)) {
          gen.abort()
        }
        chatStore.recallUserMessage(sessionId, msg.id)
      },
    })
  }

  function clearMessages() {
    if (!session.value) return
    dialog.warning({
      title: '清空消息',
      content: '确定清空当前会话的所有消息？',
      positiveText: '清空',
      negativeText: '取消',
      onPositiveClick: () => chatStore.clearMessages(session.value.id),
    })
  }

  function onComposerFocus() {
    // 对话页不因输入框聚焦自动滚底
  }

  onBeforeUnmount(() => {
    cancelStreamUiSchedule()
  })

  return {
    chatStore,
    settings,
    message,
    dialog,
    gen,
    copiedId,
    copyText,
    input,
    listRef,
    session,
    provider,
    isStreamingCurrent,
    contextInfo,
    contextHint,
    sessionTitle,
    send,
    stop,
    selectSession,
    createSession,
    removeSession,
    copyMessage,
    copyErrorMessage,
    recallMessage,
    clearMessages,
    onComposerFocus,
    ensureProvider,
    scheduleScrollToBottom,
  }
}
