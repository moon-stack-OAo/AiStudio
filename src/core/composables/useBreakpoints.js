import {computed, onMounted, ref} from 'vue'

/** 统一断点：sm <768, md <1024, lg <1280, xl ≥1280
 * SCSS 侧对应：@media (max-width: 767.98px) / 1023.98px / 1279.98px
 */
const width = ref(typeof window !== 'undefined' ? window.innerWidth : 1440)

let listening = false

function update() {
  width.value = window.innerWidth
}

function ensureListener() {
  if (listening || typeof window === 'undefined') return
  listening = true
  window.addEventListener('resize', update)
}

export function useBreakpoints() {
  onMounted(() => {
    update()
    ensureListener()
  })

  const isMobile = computed(() => width.value < 768)
  const isCompact = computed(() => width.value < 1024)

  return {
    width,
    isMobile,
    isCompact,
  }
}
