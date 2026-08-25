<script setup>
import {computed, nextTick, ref, watch} from 'vue'
import {useMessage} from 'naive-ui'
import {ListOutline, SendOutline, StopOutline} from '@vicons/ionicons5'
import SessionList from '@/components/SessionList.vue'
import MarkdownRenderer from '@/components/MarkdownRenderer.vue'
import {useChatStore} from '@/stores/chat'
import {useSettingsStore} from '@/stores/settings'
import {streamChatCompletions} from '@/api/client'
import {useBreakpoints} from '@/composables/useBreakpoints'

const chatStore = useChatStore()
const settings = useSettingsStore()
const message = useMessage()
const { isMobile, isCompact } = useBreakpoints()
const historyShow = ref(false)

const input = ref('')
const loading = ref(false)
const listRef = ref(null)
const abortRef = ref(null)

const session = computed(() => chatStore.activeSession)
const provider = computed(() => settings.activeProvider)

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

async function send() {
  const text = input.value.trim()
  if (!text || loading.value || !session.value) return
  if (!ensureProvider()) return

  input.value = ''
  chatStore.appendMessage(session.value.id, {
    role: 'user',
    content: text,
  })

  const history = session.value.messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({ role: m.role, content: m.content }))

  const assistant = chatStore.appendMessage(session.value.id, {
    role: 'assistant',
    content: '',
    streaming: true,
  })

  loading.value = true
  const controller = new AbortController()
  abortRef.value = controller

  try {
    await streamChatCompletions(provider.value, {
      messages: history,
      signal: controller.signal,
      onDelta: (_delta, full) => {
        chatStore.updateMessage(session.value.id, assistant.id, {
          content: full,
          streaming: true,
        })
        scrollToBottom()
      },
    })
    chatStore.updateMessage(session.value.id, assistant.id, {
      streaming: false,
    })
  } catch (err) {
    const latest = session.value?.messages?.find((m) => m.id === assistant.id)
    if (err.name === 'AbortError') {
      chatStore.updateMessage(session.value.id, assistant.id, {
        streaming: false,
        content: `${latest?.content || ''}\n\n[已停止]`,
      })
    } else {
      chatStore.updateMessage(session.value.id, assistant.id, {
        streaming: false,
        content: `请求失败：${err.message}`,
        error: true,
      })
      message.error(err.message)
    }
  } finally {
    loading.value = false
    abortRef.value = null
  }
}

function stop() {
  abortRef.value?.abort()
}

function onKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    send()
  }
}
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
              <n-icon :component="ListOutline" />
            </template>
          </n-button>
          <div class="session-name">{{ session?.title || '对话' }}</div>
          <n-tag :bordered="false" size="small" type="info">
            {{ provider?.chatModel || '未设置模型' }}
          </n-tag>
        </div>
        <div class="right">
          <n-select
            :options="settings.providerOptions"
            :value="settings.activeProviderId"
            class="provider-select"
            size="small"
            @update:value="settings.setActiveProvider"
          />
          <n-button
            quaternary
            size="small"
            @click="session && chatStore.clearMessages(session.id)"
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
          <div class="bubble">
            <MarkdownRenderer
              :content="msg.content"
              :placeholder="msg.streaming ? '思考中…' : ''"
            />
          </div>
        </div>
      </div>

      <div class="composer">
        <n-input
          v-model:value="input"
          :autosize="{ minRows: 4, maxRows: 8 }"
          :disabled="loading"
          placeholder="输入消息，Enter 发送，Shift+Enter 换行"
          type="textarea"
          @keydown="onKeydown"
        />
        <div class="composer-actions">
          <n-button v-if="loading" type="warning" @click="stop">
            <template #icon>
              <n-icon :component="StopOutline" />
            </template>
            停止
          </n-button>
          <n-button :disabled="!input.trim()" :loading="loading" type="primary" @click="send">
            <template #icon>
              <n-icon :component="SendOutline" />
            </template>
            发送
          </n-button>
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
  display: flex;
  flex-direction: column;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 18px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
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
  width: 180px;
}

.message-list {
  flex: 1;
  overflow: auto;
  padding: 18px 22px;
}

.empty {
  margin-top: 18vh;
  text-align: center;
  color: rgba(255, 255, 255, 0.55);
}

.empty-title {
  font-size: 20px;
  font-weight: 650;
  margin-bottom: 8px;
  color: rgba(255, 255, 255, 0.85);
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
  border-radius: 8px;
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

.bubble {
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.06);
  max-width: min(720px, 78vw);
}

.msg.user .bubble {
  background: rgba(124, 156, 255, 0.14);
}

.msg.error .bubble {
  border-color: rgba(248, 113, 113, 0.4);
  color: #fecaca;
}

.composer {
  padding: 12px 18px 18px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  display: flex;
  gap: 12px;
  align-items: flex-end;
}

.composer-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
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
  }

  .provider-select {
    flex: 1;
    width: auto;
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
    padding: 10px 12px 12px;
    flex-direction: column;
    align-items: stretch;
  }

  .composer-actions {
    justify-content: flex-end;
  }
}
</style>
