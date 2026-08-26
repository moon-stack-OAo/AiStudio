<script setup>
import {computed, nextTick, onBeforeUnmount, ref, watch} from 'vue'
import {useDialog, useMessage} from 'naive-ui'
import {CheckmarkOutline, CopyOutline, ListOutline, SendOutline, StopOutline} from '@vicons/ionicons5'
import SessionList from '@/components/SessionList.vue'
import MarkdownRenderer from '@/components/MarkdownRenderer.vue'
import ModelSelect from '@/components/ModelSelect.vue'
import {useChatStore} from '@/stores/chat'
import {useSettingsStore} from '@/stores/settings'
import {streamChatCompletions, toErrorMessage} from '@/api/client'
import {useBreakpoints} from '@/composables/useBreakpoints'
import {countChatTurns, trimChatMessages} from '@/utils/chatContext'
import {renderSelectLabel} from '@/utils/selectRender'

const chatStore = useChatStore()
const settings = useSettingsStore()
const message = useMessage()
const dialog = useDialog()
const {isMobile, isCompact} = useBreakpoints()
const historyShow = ref(false)

const input = ref('')
const loading = ref(false)
const listRef = ref(null)
const abortRef = ref(null)
const contextHintShown = ref(false)
const copiedId = ref('')
let copiedTimer = null

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
        content: `${target?.content || ''}\n\n[已停止]`,
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
  const text = String(msg?.content || '').trim()
  if (!text || msg?.streaming) return
  try {
    await navigator.clipboard.writeText(text)
    copiedId.value = msg.id
    if (copiedTimer) clearTimeout(copiedTimer)
    copiedTimer = setTimeout(() => {
      if (copiedId.value === msg.id) copiedId.value = ''
    }, 1600)
  } catch {
    message.error('复制失败')
  }
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
  if (copiedTimer) clearTimeout(copiedTimer)
})
</script>

<template>
  <div :class="{ compact: isCompact, mobile: isMobile }" class="page">
    <SessionList
        v-if="!isCompact"
        :active-id="chatStore.activeId"
        :sessions="chatStore.sortedSessions"
        title="对话历史"
        @create="chatStore.createSession()"
        @remove="chatStore.removeSession"
        @rename="(id, title) => chatStore.renameSession(id, title)"
        @select="chatStore.setActive"
    />

    <n-drawer
        v-model:show="historyShow"
        :width="isMobile ? '86%' : 280"
        display-directive="show"
        placement="left"
    >
      <n-drawer-content closable title="对话历史">
        <SessionList
            :active-id="chatStore.activeId"
            :sessions="chatStore.sortedSessions"
            embedded
            title="对话历史"
            @create="chatStore.createSession(); historyShow = false"
            @remove="chatStore.removeSession"
            @rename="(id, title) => chatStore.renameSession(id, title)"
            @select="(id) => { chatStore.setActive(id); historyShow = false }"
        />
      </n-drawer-content>
    </n-drawer>

    <div class="chat-main">
      <div class="toolbar">
        <div class="left">
          <n-button v-if="isCompact" circle quaternary size="small" @click="historyShow = true">
            <template #icon>
              <n-icon :component="ListOutline"/>
            </template>
          </n-button>
          <div class="session-name">{{ session?.title || '对话' }}</div>
        </div>
        <div class="right">
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
              quaternary
              size="small"
              @click="clearMessages"
          >
            清空
          </n-button>
        </div>
      </div>

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
            <div
                v-if="!msg.streaming && msg.content"
                class="msg-actions"
            >
              <n-tooltip placement="bottom" trigger="hover">
                <template #trigger>
                  <n-button
                      circle
                      quaternary
                      size="tiny"
                      @click="copyMessage(msg)"
                  >
                    <template #icon>
                      <n-icon
                          :component="copiedId === msg.id ? CheckmarkOutline : CopyOutline"
                          :size="14"
                      />
                    </template>
                  </n-button>
                </template>
                {{ copiedId === msg.id ? '已复制' : '复制' }}
              </n-tooltip>
            </div>
          </div>
        </div>
      </div>

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
            <n-button
                v-if="loading"
                circle
                class="action-btn send-btn"
                size="medium"
                type="warning"
                @click="stop"
            >
              <template #icon>
                <n-icon :component="StopOutline"/>
              </template>
            </n-button>
            <n-button
                v-else
                :disabled="!input.trim()"
                circle
                class="action-btn send-btn"
                size="medium"
                type="primary"
                @click="send"
            >
              <template #icon>
                <n-icon :component="SendOutline"/>
              </template>
            </n-button>
          </div>
        </div>
        <div class="composer-hint">
          <span>Enter 发送 · Shift+Enter 换行</span>
          <span v-if="contextHint" class="context-hint">{{ contextHint }}</span>
          <span v-else-if="settings.chatContextTrimEnabled" class="context-meta">
            上下文 {{ countChatTurns(session?.messages || []) }} / {{ settings.chatContextMaxTurns }} 轮
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.page {
  display: flex;
  height: 100%;
}

.chat-main {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 18px;
  border-bottom: 1px solid var(--border-subtle);
}

.left,
.right {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.session-name {
  font-weight: 600;
  font-size: 15px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.provider-select {
  width: 160px;
}

.message-list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 18px 22px;
}

.empty {
  margin-top: 18vh;
  text-align: center;
  color: var(--text-3);
}

.empty-title {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 8px;
  color: var(--text-1);
}

.empty-desc {
  font-size: 13px;
}

.msg {
  display: flex;
  gap: 10px;
  margin-bottom: 16px;
  max-width: 900px;
}

.msg.user {
  margin-left: auto;
  flex-direction: row-reverse;
}

.role {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-sm);
  display: grid;
  place-items: center;
  font-size: 11px;
  flex-shrink: 0;
  background: rgba(124, 156, 255, 0.2);
  color: #c5d2ff;
}

.msg.user .role {
  background: rgba(52, 211, 153, 0.18);
  color: #9af0c9;
}

.msg-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  max-width: min(720px, 78vw);
}

.msg.user .msg-body {
  align-items: flex-end;
}

.bubble {
  padding: 10px 12px;
  border-radius: var(--radius-lg);
  background: var(--surface-3);
  border: 1px solid var(--border-subtle);
  width: fit-content;
  max-width: 100%;
}

.msg.user .bubble {
  background: rgba(124, 156, 255, 0.14);
}

.msg.error .bubble {
  border-color: rgba(248, 113, 113, 0.4);
  color: #fecaca;
}

.msg-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.15s ease;
  color: var(--text-4);
}

.msg:hover .msg-actions,
.msg-actions:focus-within {
  opacity: 1;
}

.msg-actions :deep(.n-button) {
  color: var(--text-4);
}

.msg-actions :deep(.n-button:hover) {
  color: var(--text-2);
}

.page.mobile .msg-actions {
  opacity: 1;
}

.composer {
  padding: 10px 18px 14px;
  background: transparent;
}

.composer-card {
  display: flex;
  gap: 8px;
  align-items: flex-end;
  padding: 10px 10px 10px 12px;
  border-radius: 18px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(22, 24, 32, 0.92);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.28),
  inset 0 1px 0 rgba(255, 255, 255, 0.04);
  backdrop-filter: blur(12px);
  transition: border-color 0.15s ease, box-shadow 0.15s ease;

  &:focus-within {
    border-color: rgba(124, 156, 255, 0.45);
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.32),
    0 0 0 1px rgba(124, 156, 255, 0.18);
  }
}

.composer-field {
  flex: 1;
  min-width: 0;

  :deep(.n-input) {
    --n-border: transparent !important;
    --n-border-hover: transparent !important;
    --n-border-focus: transparent !important;
    --n-color: transparent !important;
    --n-color-focus: transparent !important;
    --n-box-shadow: none !important;
    --n-font-size: 14px;
    --n-line-height: 1.55;
    --n-padding-vertical: 6px;
    --n-padding-left: 4px;
    --n-padding-right: 4px;
    background: transparent !important;
  }

  :deep(.n-input__border),
  :deep(.n-input__state-border) {
    display: none;
  }

  :deep(.n-input__textarea-el),
  :deep(.n-input__placeholder) {
    padding-top: var(--n-padding-vertical) !important;
    padding-bottom: var(--n-padding-vertical) !important;
    padding-left: var(--n-padding-left) !important;
    padding-right: var(--n-padding-right) !important;
    font-size: var(--n-font-size);
    line-height: var(--n-line-height);
  }

  :deep(.n-input__textarea-el) {
    cursor: text;
    caret-color: var(--color-primary-hover);
    color: var(--text-1);
  }
}

.composer-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
  align-items: center;
  min-width: 0;
}

.action-btn {
  border-radius: 999px !important;
  font-weight: 600;
}

.send-btn {
  width: 40px;
  height: 40px;
  box-shadow: 0 6px 16px rgba(124, 156, 255, 0.28);
}

.composer-hint {
  margin-top: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 8px 14px;
  font-size: 11px;
  color: var(--text-4);
}

.context-hint {
  color: #fbbf24;
}

.context-meta {
  color: var(--text-4);
  opacity: 0.9;
}

@media (max-width: 1279.98px) {
  .message-list {
    padding: 14px 16px;
  }

  .bubble {
    max-width: min(720px, 86vw);
  }
}

@media (max-width: 767.98px) {
  .toolbar {
    padding: 10px 12px;
    flex-wrap: wrap;
  }

  .right {
    width: 100%;
    flex-wrap: wrap;
  }

  .provider-select {
    flex: 1;
    width: auto;
    min-width: 120px;
  }

  .right :deep(.model-select) {
    flex: 1;
    width: auto;
    min-width: 140px;
  }

  .message-list {
    padding: 12px;
  }

  .msg {
    max-width: 100%;
  }

  .bubble {
    max-width: calc(100vw - 72px);
  }

  .composer {
    padding: 8px 12px 12px;
  }

  .composer-card {
    border-radius: 16px;
    padding: 10px;
    flex-direction: column;
    align-items: stretch;
  }

  .composer-actions {
    flex-direction: row;
    justify-content: flex-end;
    min-width: 0;
  }
}
</style>
