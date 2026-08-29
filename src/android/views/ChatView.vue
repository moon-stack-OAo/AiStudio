<script setup>
defineOptions({name: 'ChatView'})

import {ref} from 'vue'
import {
  AddOutline,
  ArrowUndoOutline,
  EllipsisHorizontalOutline,
  SendOutline,
} from '@vicons/ionicons5'
import {useTooltipTrigger} from '@core/composables/useTooltipTrigger'
import SessionWorkspaceShell from '@/components/SessionWorkspaceShell.vue'
import SessionHistoryButton from '@/components/SessionHistoryButton.vue'
import MarkdownRenderer from '@core/components/MarkdownRenderer.vue'
import ModelSelect from '@core/components/ModelSelect.vue'
import CopyIconButton from '@core/components/CopyIconButton.vue'
import ComposerSendStop from '@core/components/ComposerSendStop.vue'
import {useChatSession} from '@core/composables/useChatSession'
import {renderSelectLabel} from '@core/utils/selectRender'
import {useBackCloseLayer} from '@/composables/useBackCloseLayer'

const {tooltipTrigger} = useTooltipTrigger()
const {
  chatStore,
  settings,
  copiedId,
  input,
  listRef,
  session,
  isStreamingCurrent,
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

const moreShow = ref(false)
useBackCloseLayer(moreShow)

function clearMessages() {
  moreShow.value = false
  clearMessagesCore()
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
      <div class="chat-toolbar">
        <SessionHistoryButton :count="chatStore.sessions.length" @click="openHistory" />

        <div class="chat-title">{{ sessionTitle }}</div>

        <n-button
          aria-label="新建会话"
          circle
          class="touch-target"
          quaternary
          @click="createSession"
        >
          <template #icon>
            <n-icon :component="AddOutline" />
          </template>
        </n-button>

        <n-button aria-label="更多" circle class="touch-target" quaternary @click="moreShow = true">
          <template #icon>
            <n-icon :component="EllipsisHorizontalOutline" />
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
        :class="[msg.role, {error: msg.error}]"
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
    </div>

    <template #composer>
      <div class="composer">
        <div v-if="contextHint || isStreamingCurrent" class="composer-hint is-critical">
          <span v-if="isStreamingCurrent">生成中可点击停止</span>
          <span v-if="contextHint" class="context-hint">{{ contextHint }}</span>
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
          <ModelSelect kind="chat" sheet size="medium" />
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
