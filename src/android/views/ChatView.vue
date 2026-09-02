<script setup>
defineOptions({name: 'ChatView'})

import {computed, ref} from 'vue'
import {AddOutline, ArrowUndoOutline, EllipsisHorizontalOutline} from '@vicons/ionicons5'
import {useMessage} from 'naive-ui'
import {useTooltipTrigger} from '@core/composables/useTooltipTrigger'
import SessionWorkspaceShell from '@/components/SessionWorkspaceShell.vue'
import SessionHistoryButton from '@/components/SessionHistoryButton.vue'
import MarkdownRenderer from '@core/components/MarkdownRenderer.vue'
import ModelSelect from '@core/components/ModelSelect.vue'
import CopyIconButton from '@core/components/CopyIconButton.vue'
import ComposerSendStop from '@core/components/ComposerSendStop.vue'
import SessionOverridesPanel from '@core/components/SessionOverridesPanel.vue'
import {useChatSession} from '@core/composables/useChatSession'
import {countChatTurns} from '@core/utils/chatContext'
import {formatClockTime} from '@core/utils/datetime'
import {renderSelectLabel} from '@core/utils/selectRender'
import {useBackCloseLayer} from '@/composables/useBackCloseLayer'

const {tooltipTrigger} = useTooltipTrigger()
const uiMessage = useMessage()
const {
  chatStore,
  settings,
  copiedId,
  input,
  listRef,
  bottomRef,
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
  recallMessage,
  clearMessages: clearMessagesCore,
  onComposerFocus,
} = useChatSession({
  contextHintVariant: 'short',
  notifyCreateSession: true,
})

const assistantLabel = computed(() => {
  const model = String(provider.value?.chatModel || '').trim()
  if (model) return model
  return String(provider.value?.name || 'AI').trim() || 'AI'
})

function msgRoleName(msg) {
  return msg?.role === 'user' ? '你' : assistantLabel.value
}

function msgRoleMeta(msg) {
  if (msg?.streaming) return ''
  return formatClockTime(msg?.createdAt)
}

const moreShow = ref(false)
const overridesShow = ref(false)
useBackCloseLayer(moreShow)
useBackCloseLayer(overridesShow)

function clearMessages() {
  moreShow.value = false
  clearMessagesCore()
}

function onToolbarCreate() {
  moreShow.value = false
  createSession()
}

function openOverrides() {
  moreShow.value = false
  overridesShow.value = true
}

function onOverridesSaved() {
  overridesShow.value = false
  uiMessage.success('已保存本会话参数')
}

function focusComposerInput() {
  const root = document.querySelector('.composer-field textarea, .composer-field input')
  if (root && typeof root.focus === 'function') root.focus()
  onComposerFocus()
}
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
    <template #toolbar="{openHistory}">
      <div class="chat-toolbar app-top">
        <SessionHistoryButton :count="chatStore.sessions.length" @click="openHistory" />
        <div class="top-title-block">
          <h1 class="top-title">{{ sessionTitle || '对话' }}</h1>
        </div>
        <button
          aria-label="更多"
          class="top-more touch-target"
          type="button"
          @click="moreShow = true"
        >
          <n-icon :component="EllipsisHorizontalOutline" :size="18" />
        </button>
      </div>
    </template>

    <div ref="listRef" class="message-list">
      <div v-if="!session?.messages?.length" class="empty-card empty-state">
        <div class="empty-art" aria-hidden="true">◇</div>
        <div class="empty-title">开始一段新对话</div>
        <div class="empty-desc">支持多轮对话、代码块与多模态附件。选择模型后直接输入即可。</div>
        <button class="empty-cta" type="button" @click="focusComposerInput">写第一条消息</button>
      </div>

      <div
        v-for="msg in session?.messages || []"
        :key="msg.id"
        :class="[msg.role, {error: msg.error}]"
        class="msg"
      >
        <div :class="{ai: msg.role !== 'user'}" class="avatar-sm" aria-hidden="true">
          {{ msg.role === 'user' ? '你' : 'AI' }}
        </div>
        <div class="msg-body">
          <div class="bubble">
            <div class="bubble-role">
              <strong class="bubble-role-name">{{ msgRoleName(msg) }}</strong>
              <span v-if="msg.streaming" class="status-pill run">生成中</span>
              <span v-else-if="msgRoleMeta(msg)" class="bubble-role-meta">{{
                msgRoleMeta(msg)
              }}</span>
            </div>
            <MarkdownRenderer
              v-if="msg.content || msg.streaming"
              :content="msg.content"
              :placeholder="msg.streaming ? '思考中…' : ''"
              :streaming="!!msg.streaming"
            />
            <div v-else-if="msg.error" class="bubble-error">
              {{ msg.errorMessage || '请求失败' }}
            </div>
          </div>
          <div v-if="msg.stopped && !msg.streaming" class="msg-status stopped">已停止</div>
          <div v-if="msg.error && !msg.streaming && msg.content" class="msg-status error">
            {{ msg.errorMessage || '请求失败' }}
          </div>
          <div v-if="!msg.streaming && (msg.content || msg.role === 'user')" class="msg-actions">
            <CopyIconButton
              v-if="msg.content"
              :active="copiedId === msg.id"
              @click="copyMessage(msg)"
            />
            <n-tooltip v-if="msg.role === 'user'" :trigger="tooltipTrigger" placement="bottom">
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
                    <n-icon :component="ArrowUndoOutline" :size="14" />
                  </template>
                </n-button>
              </template>
              撤回此条消息
            </n-tooltip>
          </div>
        </div>
      </div>
      <div ref="bottomRef" class="message-list-anchor" aria-hidden="true" />
    </div>

    <template #composer>
      <div class="composer">
        <div
          v-if="contextHint || isStreamingCurrent || settings.chatContextTrimEnabled"
          :class="{'is-critical': !!contextHint || isStreamingCurrent}"
          class="composer-hint"
        >
          <span v-if="isStreamingCurrent">生成中可点击停止</span>
          <span v-if="contextHint" class="context-hint">{{ contextHint }}</span>
          <span v-else-if="settings.chatContextTrimEnabled" class="context-meta">
            {{ countChatTurns(session?.messages || []) }} /
            {{ settings.chatContextMaxTurns }}
            <template v-if="settings.chatContextMaxCharsEnabled">
              · {{ contextInfo.keptChars }}/{{ settings.chatContextMaxChars }}
            </template>
          </span>
        </div>
        <div class="composer-card">
          <n-input
            v-model:value="input"
            :autosize="{minRows: 1, maxRows: 5}"
            :disabled="isStreamingCurrent"
            class="composer-field"
            placeholder="输入消息…"
            type="textarea"
            @focus="onComposerFocus"
          />
          <div class="composer-actions">
            <ComposerSendStop
              variant="label"
              send-label="发送"
              :disabled="!input.trim()"
              :loading="isStreamingCurrent"
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
          <ModelSelect kind="chat" sheet size="medium" />
        </div>
        <n-button block secondary @click="onToolbarCreate">
          <template #icon>
            <n-icon :component="AddOutline" />
          </template>
          新建会话
        </n-button>
        <n-button block secondary @click="openOverrides">本会话参数</n-button>
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

  <n-drawer
    v-model:show="overridesShow"
    class="more-drawer"
    display-directive="show"
    height="auto"
    placement="bottom"
  >
    <n-drawer-content closable title="本会话参数">
      <div class="more-sheet">
        <div class="more-hint">仅影响当前会话；未开启自定义时跟随全局设置</div>
        <SessionOverridesPanel :session-id="session?.id || ''" @saved="onOverridesSaved" />
      </div>
    </n-drawer-content>
  </n-drawer>
</template>

<style lang="scss" scoped src="./ChatView.scss"></style>
