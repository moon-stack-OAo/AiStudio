<script setup>
defineOptions({name: 'ChatView'})

import {computed, ref} from 'vue'
import {ArrowUndoOutline, OptionsOutline, SendOutline} from '@vicons/ionicons5'
import {useMessage} from 'naive-ui'
import {useTooltipTrigger} from '@core/composables/useTooltipTrigger'
import SessionWorkspaceShell from '@/components/SessionWorkspaceShell.vue'
import MarkdownRenderer from '@core/components/MarkdownRenderer.vue'
import ModelSelect from '@core/components/ModelSelect.vue'
import CopyIconButton from '@core/components/CopyIconButton.vue'
import ComposerSendStop from '@core/components/ComposerSendStop.vue'
import SessionOverridesPanel from '@core/components/SessionOverridesPanel.vue'
import {useBreakpoints} from '@core/composables/useBreakpoints'
import {useChatSession} from '@core/composables/useChatSession'
import {useManualDropdown} from '@/composables/useManualDropdown'
import {countChatTurns} from '@core/utils/chatContext'
import {formatClockTime} from '@core/utils/datetime'
import {renderSelectLabel} from '@core/utils/selectRender'

const {isMobile, isCompact} = useBreakpoints()
const {tooltipTrigger} = useTooltipTrigger()
const uiMessage = useMessage()
const overridesShow = ref(false)
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
  effectiveTemperature,
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
} = useChatSession({contextHintVariant: 'full'})

const assistantLabel = computed(() => {
  const model = String(provider.value?.chatModel || '').trim()
  if (model) return model
  return String(provider.value?.name || 'AI').trim() || 'AI'
})

const tempChipLabel = computed(() => `温度 ${Number(effectiveTemperature.value).toFixed(1)}`)

const composerFootHint = computed(() => {
  if (isStreamingCurrent.value) return '生成中可点击停止'
  if (contextHint.value) return contextHint.value
  if (settings.chatContextTrimEnabled) {
    let text = `上下文 ${countChatTurns(session.value?.messages || [])} / ${settings.chatContextMaxTurns} 轮`
    if (settings.chatContextMaxCharsEnabled) {
      text += ` · ${contextInfo.value.keptChars}/${settings.chatContextMaxChars} 字`
    }
    return text
  }
  return isMobile.value ? '' : 'Enter 发送 · Shift+Enter 换行'
})

function msgRoleName(msg) {
  return msg?.role === 'user' ? '你' : assistantLabel.value
}

function msgRoleMeta(msg) {
  if (msg?.streaming) return ''
  return formatClockTime(msg?.createdAt)
}

function onOverridesSaved() {
  overridesShow.value = false
  uiMessage.success('已保存本会话参数')
}

const {
  show: ctxShow,
  x: ctxX,
  y: ctxY,
  options: ctxOptions,
  open: openCtxMenu,
  handleSelect: onCtxSelect,
  handleUpdateShow: onCtxUpdateShow,
  handleClickOutside: onCtxClickOutside,
} = useManualDropdown()

function onMsgContextMenu(e, msg) {
  if (msg?.streaming) return
  const options = []
  if (String(msg?.content || '').trim()) {
    options.push({label: '复制', key: 'copy'})
  }
  if (msg?.error) {
    options.push({label: '复制错误信息', key: 'copy-error'})
  }
  if (msg?.role === 'user') {
    options.push({label: '撤回此条消息', key: 'recall'})
  }
  if (!options.length) return
  openCtxMenu(e, options, (key) => {
    if (key === 'copy') copyMessage(msg)
    else if (key === 'copy-error') copyErrorMessage(msg)
    else if (key === 'recall') recallMessage(msg)
  })
}

function onKeydown(e) {
  if (isMobile.value) return
  if (e.isComposing) return
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    send()
  }
}
</script>

<template>
  <SessionWorkspaceShell
    :active-id="chatStore.activeId"
    :history-title="'对话历史'"
    :is-compact="isCompact"
    :is-mobile="isMobile"
    :session-title="session?.title || '对话'"
    :sessions="chatStore.sortedSessions"
    @create="createSession"
    @remove="removeSession"
    @rename="(id, title) => chatStore.renameSession(id, title)"
    @select="selectSession"
  >
    <template #toolbar-right>
      <ModelSelect kind="chat" />
      <n-select
        :options="settings.providerOptions"
        :render-label="renderSelectLabel"
        :value="settings.activeProviderId"
        class="provider-select provider-select-muted"
        size="small"
        @update:value="settings.setActiveProvider"
      />
      <n-tooltip :trigger="tooltipTrigger" placement="bottom">
        <template #trigger>
          <n-button
            aria-label="本会话参数"
            circle
            class="touch-target"
            quaternary
            size="small"
            @click="overridesShow = true"
          >
            <template #icon>
              <n-icon :component="OptionsOutline" />
            </template>
          </n-button>
        </template>
        本会话参数
      </n-tooltip>
      <n-button
        :disabled="!session?.messages?.length"
        aria-label="清空消息"
        quaternary
        size="small"
        class="toolbar-clear"
        @click="clearMessages"
      >
        清空
      </n-button>
    </template>

    <div ref="listRef" class="message-list">
      <div v-if="!session?.messages?.length" class="empty empty-state">
        <div class="empty-art" aria-hidden="true">◇</div>
        <div class="empty-title">开始对话</div>
        <div class="empty-desc">
          支持 OpenAI / Grok 及任意兼容接口。在设置中填入 Base URL 与 API Key。
        </div>
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
          <div class="bubble" @contextmenu="onMsgContextMenu($event, msg)">
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
        <div class="composer-card">
          <div v-if="!isMobile" class="composer-tools" aria-label="会话参数摘要">
            <button
              class="composer-chip is-active is-interactive"
              type="button"
              @click="overridesShow = true"
            >
              {{ tempChipLabel }}
            </button>
            <button
              class="composer-chip is-interactive"
              type="button"
              @click="overridesShow = true"
            >
              本会话参数
            </button>
          </div>
          <n-input
            v-model:value="input"
            :autosize="{minRows: isMobile ? 1 : 3, maxRows: isMobile ? 5 : 8}"
            :disabled="isStreamingCurrent"
            class="composer-field"
            :placeholder="isMobile ? '输入消息…' : '输入消息，Enter 发送，Shift+Enter 换行…'"
            type="textarea"
            @focus="onComposerFocus"
            @keydown="onKeydown"
          />
          <div class="composer-foot">
            <span
              v-if="composerFootHint"
              :class="{'is-warning': !!contextHint}"
              class="composer-foot-hint"
            >
              {{ composerFootHint }}
            </span>
            <div class="composer-actions">
              <ComposerSendStop
                with-tooltip
                variant="label"
                send-label="发送"
                :disabled="!input.trim()"
                :loading="isStreamingCurrent"
                :send-icon="SendOutline"
                @send="send"
                @stop="stop"
              />
            </div>
          </div>
        </div>
      </div>
    </template>
  </SessionWorkspaceShell>

  <n-dropdown
    placement="bottom-start"
    trigger="manual"
    :x="ctxX"
    :y="ctxY"
    :options="ctxOptions"
    :show="ctxShow"
    :on-clickoutside="onCtxClickOutside"
    @select="onCtxSelect"
    @update:show="onCtxUpdateShow"
  />

  <n-modal
    v-model:show="overridesShow"
    :mask-closable="true"
    preset="card"
    style="width: min(480px, 92vw)"
    title="本会话参数"
  >
    <div class="overrides-modal-desc">仅影响当前会话；未开启自定义时跟随全局设置</div>
    <SessionOverridesPanel :session-id="session?.id || ''" @saved="onOverridesSaved" />
  </n-modal>
</template>

<style lang="scss" scoped src="./ChatView.scss"></style>
