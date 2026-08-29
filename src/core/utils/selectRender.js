import {h} from 'vue'
import {NEllipsis} from 'naive-ui'

/**
 * n-select 超长文案：省略号 + 悬停气泡显示全文
 * @param {{ label?: string, value?: unknown }} option
 */
export function renderSelectLabel(option) {
  const text = String(option?.label ?? option?.value ?? '')
  return h(
    NEllipsis,
    {
      tooltip: {
        contentStyle: {
          maxWidth: 'min(420px, 80vw)',
          whiteSpace: 'normal',
          wordBreak: 'break-all',
          lineHeight: '1.45',
        },
      },
    },
    {default: () => text},
  )
}
