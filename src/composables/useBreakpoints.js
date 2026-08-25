import {computed, onMounted, onUnmounted, ref} from 'vue'

/** 统一断点：xs <640, sm <768, md <1024, lg <1280, xl ≥1280 */
const QUERIES = {
  sm: '(max-width: 767.98px)',
  md: '(max-width: 1023.98px)',
  lg: '(max-width: 1279.98px)',
}

function match(query) {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia(query).matches
}

export function useBreakpoints() {
  const width = ref(typeof window !== 'undefined' ? window.innerWidth : 1440)

  function update() {
    width.value = window.innerWidth
  }

  onMounted(() => {
    update()
    window.addEventListener('resize', update)
  })

  onUnmounted(() => {
    window.removeEventListener('resize', update)
  })

  const isMobile = computed(() => width.value < 768)
  const isTablet = computed(() => width.value >= 768 && width.value < 1024)
  const isLaptop = computed(() => width.value >= 1024 && width.value < 1280)
  const isDesktop = computed(() => width.value >= 1280)
  const isCompact = computed(() => width.value < 1024)
  const isNarrow = computed(() => match(QUERIES.md) || width.value < 1024)

  return {
    width,
    isMobile,
    isTablet,
    isLaptop,
    isDesktop,
    isCompact,
    isNarrow,
  }
}
