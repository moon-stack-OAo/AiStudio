<script setup>
defineOptions({name: 'ChatView'})

import {computed, onActivated, onBeforeUnmount, onMounted, ref, watch} from 'vue'
import {useDialog, useMessage} from 'naive-ui'
import {AddOutline, ArrowUndoOutline, EllipsisHorizontalOutline, SendOutline,} from '@vicons/ionicons5'
import {useTooltipTrigger} from '@core/composables/useTooltipTrigger'
import SessionWorkspaceShell from '@/components/SessionWorkspaceShell.vue'
import SessionHistoryButton from '@/components/SessionHistoryButton.vue'
import MarkdownRenderer from '@core/components/MarkdownRenderer.vue'
import ModelSelect from '@core/components/ModelSelect.vue'
import CopyIconButton from '@core/components/CopyIconButton.vue'
import ComposerSendStop from '@core/components/ComposerSendStop.vue'
import {useChatStore} from '@core/stores/chat'
import {useSettingsStore} from '@core/stores/settings'
import {streamChatCompletions, toErrorMessage} from '@core/api/client'
import {useCopyFeedback} from '@core/composables/useCopyFeedback'
import {useScrollToBottom} from '@core/composables/useScrollToBottom'
import {trimChatMessages} from '@core/utils/chatContext'
import {renderSelectLabel} from '@core/utils/selectRender'
import {useBackCloseLayer} from '@/composables/useBackCloseLayer'
import {chatGeneration} from '@core/runtime/generationRuntime'
import {useGenerationRuntime} from '@core/composables/useGenerationRuntime'

const chatStore = useChatStore()
const settings = useSettingsStore()
const message = useMessage()
const dialog = useDialog()
const {copiedId, copyText} = useCopyFeedback()
const {tooltipTrigger} = useTooltipTrigger()
const gen = useGenerationRuntime(chatGeneration)

const input = ref('')
const listRef = ref(null)
const {scheduleScrollToBottom} = useScrollToBottom(listRef)
const contextHintShown = ref(false)
const moreShow = ref(false)
useBackCloseLayer(moreShow)

/** 流式 UI 更新：合并同帧内的 delta 写入与滚动，停止/结束时 flush */
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
  chatStore.updateMessage(
    sessionId,
    messageId,
    {content, streaming: true},
    {persist: false},
  )
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
  return trimChatMessages(msgs, {
    enabled: settings.chatContextTrimEnabled,
    maxTurns: settings.chatContextMaxTurns,
  })
})

const contextHint = computed(() => {
  if (!settings.chatContextTrimEnabled) return ''
  const {totalTurns, maxTurns, nearLimit, truncated} = contextInfo.value
  if (truncated) {
    return `已裁剪：保留最近 ${maxTurns} 轮（当前 ${totalTurns} 轮）`
  }
  if (nearLimit) {
    return `接近上限：${totalTurns} / ${maxTurns} 轮`
  }
  return ''
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

  const trimmed = trimChatMessages(rawHistory, {
    enabled: settings.chatContextTrimEnabled,
    maxTurns: settings.chatContextMaxTurns,
  })

  if (trimmed.truncated && !contextHintShown.value) {
    message.info(
      `上下文已裁剪：仅发送最近 ${trimmed.keptTurns} 轮（共 ${trimmed.totalTurns} 轮），本地记录仍完整保留`,
      {duration: 4000},
    )
    contextHintShown.value = true
  } else if (trimmed.nearLimit && !trimmed.truncated && !contextHintShown.value) {
    message.warning(
      `上下文接近上限（${trimmed.totalTurns} / ${trimmed.maxTurns} 轮），建议新开会话`,
      {duration: 3500},
    )
    contextHintShown.value = true
  }

  const assistant = chatStore.appendMessage(sessionId, {
    role: 'assistant',
    content: '',
    streaming: true,
  })

  const controller = new AbortController()
  gen.begin(sessionId, controller)

  try {
    await streamChatCompletions(provider.value, {
      messages: trimmed.messages,
      signal: controller.signal,
      onDelta: (_delta, full) => {
        if (controller.signal.aborted) return
        scheduleStreamUi(sessionId, assistant.id, full)
      },
    })
    flushStreamUi()
    const target = chatStore.sessions.find((s) => s.id === sessionId)
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
    const target = chatStore.sessions.find((s) => s.id === sessionId)
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
  message.success('已新建会话')
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

function onComposerFocus() {
  // 对话页不因输入框聚焦自动滚底
}

function clearMessages() {
  if (!session.value) return
  moreShow.value = false
  dialog.warning({
    title: '清空消息',
    content: '确定清空当前会话的所有消息？',
    positiveText: '清空',
    negativeText: '取消',
    onPositiveClick: () => chatStore.clearMessages(session.value.id),
  })
}

onBeforeUnmount(() => {
  cancelStreamUiSchedule()
})
</script>

<template>
  <SessionWorkspaceShell
    :active-id="chatStore.activeId"
    :history-title="'对话历史'"
    :sessions="chatStore.sortedSessions"
    @create="createSession"
    @remove="removeSession"
    @rename="(id, title) => chatStore.renameSession(id, title)"
    @select="selectSession"
  >
    <template #toolbar="{ openHistory }">
      <div class="chat-toolbar">
        <SessionHistoryButton
          :count="chatStore.sessions.length"
          @click="openHistory"
        />

        <div class="chat-title">{{ sessionTitle }}</div>

        <n-button
          aria-label="新建会话"
          circle
          class="touch-target"
          quaternary
          @click="createSession"
        >
          <template #icon>
            <n-icon :component="AddOutline"/>
          </template>
        </n-button>

        <n-button
          aria-label="更多"
          circle
          class="touch-target"
          quaternary
          @click="moreShow = true"
        >
          <template #icon>
            <n-icon :component="EllipsisHorizontalOutline"/>
          </template>
        </n-button>
      </div>
    </template>

    <div ref="listRef" class="message-list">
      <div v-if="!session?.messages?.length" class="empty">
        <div class="empty-title">开始对话</div>
        <div class="empty-desc">在设置中配置接口后即可发送消息</div>
      </div>

      <div
        v-for="msg in session?.messages || []"
        :key="msg.id"
        :class="[msg.role, { error: msg.error }]"
        class="msg"
      >
        <div class="role">{{ msg.role === 'user' ? '你' : 'AI' }}</div>
        <div class="msg-body">
          <div class="bubble">
            <MarkdownRenderer
              :content="msg.content"
              :placeholder="msg.streaming ? '思考中…' : ''"
            />
          </div>
          <div v-if="msg.stopped && !msg.streaming" class="msg-status stopped">已停止</div>
          <div v-if="msg.error && !msg.streaming" class="msg-status error">
            {{ msg.errorMessage || '请求失败' }}
          </div>
          <div
            v-if="!msg.streaming && (msg.content || msg.role === 'user')"
            class="msg-actions"
          >
            <CopyIconButton
              v-if="msg.content"
              :active="copiedId === msg.id"
              @click="copyMessage(msg)"
            />
            <n-tooltip
              v-if="msg.role === 'user'"
              :trigger="tooltipTrigger"
              placement="bottom"
            >
              <template #trigger>
                <n-button
                  aria-label="撤回此条消息"
                  circle
                  class="touch-target"
                  quaternary
                  size="tiny"
                  @click="recallMessage(msg)"
                >
                  <template #icon>
                    <n-icon :component="ArrowUndoOutline" :size="14"/>
                  </template>
                </n-button>
              </template>
              撤回此条消息
            </n-tooltip>
          </div>
        </div>
      </div>
    </div>

    <template #composer>
      <div class="composer">
        <div
          v-if="contextHint || isStreamingCurrent"
          class="composer-hint is-critical"
        >
          <span v-if="isStreamingCurrent">生成中可点击停止</span>
          <span v-if="contextHint" class="context-hint">{{ contextHint }}</span>
        </div>
        <div class="composer-card">
          <n-input
            v-model:value="input"
            :autosize="{ minRows: 1, maxRows: 5 }"
            :disabled="isStreamingCurrent"
            class="composer-field"
            placeholder="输入消息…"
            type="textarea"
            @focus="onComposerFocus"
          />
          <div class="composer-actions">
            <ComposerSendStop
              :disabled="!input.trim()"
              :loading="isStreamingCurrent"
              :send-icon="SendOutline"
              @send="send"
              @stop="stop"
            />
          </div>
        </div>
      </div>
    </template>
  </SessionWorkspaceShell>

  <n-drawer
    v-model:show="moreShow"
    class="more-drawer"
    display-directive="show"
    height="auto"
    placement="bottom"
  >
    <n-drawer-content closable title="对话设置">
      <div class="more-sheet">
        <div class="more-field">
          <div class="more-label">提供商</div>
          <n-select
            :options="settings.providerOptions"
            :render-label="renderSelectLabel"
            :value="settings.activeProviderId"
            size="medium"
            @update:value="settings.setActiveProvider"
          />
        </div>
        <div class="more-field">
          <div class="more-label">模型</div>
          <ModelSelect kind="chat" sheet size="medium"/>
        </div>
        <n-button
          :disabled="!session?.messages?.length"
          block
          secondary
          type="warning"
          @click="clearMessages"
        >
          清空当前会话
        </n-button>
        <div class="more-hint">接口密钥请到「设置」页管理</div>
      </div>
    </n-drawer-content>
  </n-drawer>
</template>

<style lang="scss" scoped src="./ChatView.scss"></style>
