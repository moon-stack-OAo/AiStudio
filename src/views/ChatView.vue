<script setup>
import {computed, nextTick, onBeforeUnmount, ref, watch} from 'vue'
import {useDialog, useMessage} from 'naive-ui'
import {SendOutline} from '@vicons/ionicons5'
import SessionWorkspaceShell from '@/components/SessionWorkspaceShell.vue'
import MarkdownRenderer from '@/components/MarkdownRenderer.vue'
import ModelSelect from '@/components/ModelSelect.vue'
import CopyIconButton from '@/components/CopyIconButton.vue'
import ComposerSendStop from '@/components/ComposerSendStop.vue'
import {useChatStore} from '@/stores/chat'
import {useSettingsStore} from '@/stores/settings'
import {streamChatCompletions, toErrorMessage} from '@/api/client'
import {useBreakpoints} from '@/composables/useBreakpoints'
import {useCopyFeedback} from '@/composables/useCopyFeedback'
import {countChatTurns, trimChatMessages} from '@/utils/chatContext'
import {renderSelectLabel} from '@/utils/selectRender'

const chatStore = useChatStore()
const settings = useSettingsStore()
const message = useMessage()
const dialog = useDialog()
const {isMobile, isCompact} = useBreakpoints()
const {copiedId, copyText} = useCopyFeedback()

const input = ref('')
const loading = ref(false)
const listRef = ref(null)
const abortRef = ref(null)
const contextHintShown = ref(false)

const session = computed(() => chatStore.activeSession)
const provider = computed(() => settings.activeProvider)

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
    return `已启用上下文裁剪：保留最近 ${maxTurns} 轮（当前 ${totalTurns} 轮）`
  }
  if (nearLimit) {
    return `上下文接近上限：${totalTurns} / ${maxTurns} 轮，建议新开会话或提高上限`
  }
  return ''
})

watch(
    () => session.value?.id,
    () => {
      contextHintShown.value = false
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

watch(
    () => session.value?.messages?.length,
    async () => {
      await nextTick()
      scrollToBottom()
    },
)

function scrollToBottom() {
  const el = listRef.value
  if (el) el.scrollTop = el.scrollHeight
}

async function send() {
  const text = input.value.trim()
  if (!text || loading.value || !session.value) return
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

  loading.value = true
  const controller = new AbortController()
  abortRef.value = controller

  try {
    await streamChatCompletions(provider.value, {
      messages: trimmed.messages,
      signal: controller.signal,
      onDelta: (_delta, full) => {
        chatStore.updateMessage(
            sessionId,
            assistant.id,
            {content: full, streaming: true},
            {persist: false},
        )
        scrollToBottom()
      },
    })
    chatStore.updateMessage(sessionId, assistant.id, {
      streaming: false,
    })
  } catch (err) {
    const target = chatStore.sessions.find((s) => s.id === sessionId)
        ?.messages?.find((m) => m.id === assistant.id)
    if (err?.name === 'AbortError') {
      chatStore.updateMessage(sessionId, assistant.id, {
        streaming: false,
        stopped: true,
        content: target?.content || '',
      })
    } else {
      const errText = toErrorMessage(err, '请求失败，请稍后重试')
      chatStore.updateMessage(sessionId, assistant.id, {
        streaming: false,
        content: `请求失败：${errText}`,
        error: true,
      })
      message.error(errText)
    }
  } finally {
    loading.value = false
    abortRef.value = null
  }
}

function stop() {
  abortRef.value?.abort()
}

async function copyMessage(msg) {
  if (msg?.streaming) return
  const ok = await copyText(msg?.id, msg?.content)
  if (!ok) message.error('复制失败')
}

function onKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    send()
  }
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

onBeforeUnmount(() => {
  abortRef.value?.abort()
})
</script>

<template>
  <SessionWorkspaceShell
    :active-id="chatStore.activeId"
    :history-title="'对话历史'"
    :is-compact="isCompact"
    :is-mobile="isMobile"
    :session-title="session?.title || '对话'"
    :sessions="chatStore.sortedSessions"
    @create="chatStore.createSession()"
    @remove="chatStore.removeSession"
    @rename="(id, title) => chatStore.renameSession(id, title)"
    @select="chatStore.setActive"
  >
    <template #toolbar-right>
      <n-select
        :options="settings.providerOptions"
        :render-label="renderSelectLabel"
        :value="settings.activeProviderId"
        class="provider-select"
        size="small"
        @update:value="settings.setActiveProvider"
      />
      <ModelSelect kind="chat"/>
      <n-button
        :disabled="!session?.messages?.length"
        quaternary
        size="small"
        @click="clearMessages"
      >
        清空
      </n-button>
    </template>

    <div ref="listRef" class="message-list">
      <div v-if="!session?.messages?.length" class="empty">
        <div class="empty-title">开始对话</div>
        <div class="empty-desc">
          支持 OpenAI / Grok 及任意兼容接口。在设置中填入 Base URL 与 API Key。
        </div>
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
          <div
            v-if="!msg.streaming && msg.content"
            class="msg-actions"
          >
            <CopyIconButton
              :active="copiedId === msg.id"
              @click="copyMessage(msg)"
            />
          </div>
        </div>
      </div>
    </div>

    <template #composer>
      <div class="composer">
        <div class="composer-card">
          <n-input
            v-model:value="input"
            :autosize="{ minRows: 3, maxRows: 8 }"
            :disabled="loading"
            class="composer-field"
            placeholder="输入消息，Enter 发送，Shift+Enter 换行"
            type="textarea"
            @keydown="onKeydown"
          />
          <div class="composer-actions">
            <ComposerSendStop
              :disabled="!input.trim()"
              :loading="loading"
              :send-icon="SendOutline"
              @send="send"
              @stop="stop"
            />
          </div>
        </div>
        <div class="composer-hint">
          <span>{{ loading ? '生成中可点击停止' : 'Enter 发送 · Shift+Enter 换行' }}</span>
          <span v-if="contextHint" class="context-hint">{{ contextHint }}</span>
          <span v-else-if="settings.chatContextTrimEnabled" class="context-meta">
            上下文 {{ countChatTurns(session?.messages || []) }} / {{ settings.chatContextMaxTurns }} 轮
          </span>
        </div>
      </div>
    </template>
  </SessionWorkspaceShell>
</template>

<style lang="scss" scoped src="./ChatView.scss"></style>
