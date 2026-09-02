import {computed, ref} from 'vue'
import {useDialog, useMessage} from 'naive-ui'
import {useSettingsStore} from '@core/stores/settings'
import {API_TIMEOUT_MS, CHAT_CONTEXT_MAX_TURNS_OPTIONS} from '@core/utils/constants'
import {
  applySettingsImport,
  buildSettingsExport,
  importContainsSecrets,
  parseSettingsImport,
} from '@core/utils/settingsBackup'

export const MAX_TOKENS_OPTIONS = [
  {label: '不限制', value: 0},
  {label: '1024', value: 1024},
  {label: '2048', value: 2048},
  {label: '4096', value: 4096},
  {label: '8192', value: 8192},
]

/**
 * 对话设置页共享逻辑（桌面 / Android 模板密度差异由端侧处理）。
 */
export function useChatSettings() {
  const settings = useSettingsStore()
  const message = useMessage()
  const dialog = useDialog()

  const includeSecretsOnExport = ref(false)
  const fileInputRef = ref(null)
  const importing = ref(false)

  const maxTurnsOptions = computed(() => {
    const opts = CHAT_CONTEXT_MAX_TURNS_OPTIONS.map((n) => ({
      label: `${n} 轮`,
      value: n,
    }))
    const cur = settings.chatContextMaxTurns
    if (!CHAT_CONTEXT_MAX_TURNS_OPTIONS.includes(cur)) {
      opts.push({label: `${cur} 轮`, value: cur})
    }
    return opts
  })

  function onTrimEnabledChange(v) {
    if (v) {
      settings.setChatContextTrimEnabled(true)
      return
    }
    dialog.warning({
      title: '关闭自动裁剪？',
      content:
        '关闭后将发送全部对话历史。长会话可能超出模型上下文上限，导致请求失败，并可能显著增加费用。确定关闭？',
      positiveText: '仍要关闭',
      negativeText: '取消',
      onPositiveClick: () => {
        settings.setChatContextTrimEnabled(false)
      },
    })
  }

  function onMaxTurnsUpdate(v) {
    const n = Math.max(1, Math.floor(Number(v) || 1))
    settings.setChatContextMaxTurns(n)
  }

  function onMaxCharsUpdate(v) {
    const n = Math.max(1, Math.floor(Number(v) || 1))
    settings.setChatContextMaxChars(n)
  }

  function onMaxTokensUpdate(v) {
    const n = Math.max(0, Math.floor(Number(v) || 0))
    settings.setChatMaxTokens(n)
  }

  const apiTimeoutSec = computed(() => Math.round((settings.apiTimeoutMs || API_TIMEOUT_MS) / 1000))

  function onTimeoutSecUpdate(v) {
    const sec = Math.max(5, Math.floor(Number(v) || 180))
    settings.setApiTimeoutMs(sec * 1000)
  }

  function downloadJson(filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'})
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  function setIncludeSecretsOnExport(v) {
    includeSecretsOnExport.value = Boolean(v)
  }

  function onExport() {
    const data = buildSettingsExport(settings, {includeSecrets: includeSecretsOnExport.value})
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
    downloadJson(`ai-studio-settings-${stamp}.json`, data)
    message.success(
      includeSecretsOnExport.value ? '已导出（含 API Key）' : '已导出（API Key 已脱敏）',
    )
  }

  function onImportClick() {
    fileInputRef.value?.click()
  }

  async function onImportFile(e) {
    const file = e.target?.files?.[0]
    e.target.value = ''
    if (!file || importing.value) return
    importing.value = true
    try {
      const text = await file.text()
      let raw
      try {
        raw = JSON.parse(text)
      } catch {
        message.error('JSON 解析失败')
        return
      }
      const parsed = parseSettingsImport(raw)
      if (!parsed.ok) {
        message.error(parsed.error)
        return
      }
      const hasSecrets = importContainsSecrets(parsed.value)
      const run = () => {
        try {
          applySettingsImport(settings, parsed.value, {mergeProviders: true})
          message.success(
            hasSecrets ? '已导入设置（含 API Key）' : '已导入设置（提供商与对话偏好已合并）',
          )
        } catch (err) {
          message.error(err?.message || '导入失败')
        }
      }
      if (hasSecrets) {
        dialog.warning({
          title: '导入含 API Key',
          content: '文件中包含 API Key，导入后将写入本机设置。确定继续？',
          positiveText: '导入',
          negativeText: '取消',
          onPositiveClick: run,
        })
      } else {
        run()
      }
    } catch (err) {
      message.error(err?.message || '导入失败')
    } finally {
      importing.value = false
    }
  }

  return {
    settings,
    includeSecretsOnExport,
    fileInputRef,
    importing,
    maxTurnsOptions,
    maxTokensOptions: MAX_TOKENS_OPTIONS,
    apiTimeoutSec,
    onTrimEnabledChange,
    onMaxTurnsUpdate,
    onMaxCharsUpdate,
    onMaxTokensUpdate,
    onTimeoutSecUpdate,
    setIncludeSecretsOnExport,
    onExport,
    onImportClick,
    onImportFile,
  }
}
