import {computed} from 'vue'
import {useBreakpoints} from '@core/composables/useBreakpoints'

/** 移动端用 click，桌面用 hover，避免触控无法触发 tooltip */
export function useTooltipTrigger() {
  const {isMobile} = useBreakpoints()
  const tooltipTrigger = computed(() => (isMobile.value ? 'click' : 'hover'))
  return {tooltipTrigger}
}
