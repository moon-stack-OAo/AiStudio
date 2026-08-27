import {createApp} from 'vue'
import {createPinia} from 'pinia'
import App from './App.vue'
import router from './router'
import './styles/main.scss'
import {applyAndroidSafeAreaInsets} from '@core/utils/safeArea'

applyAndroidSafeAreaInsets()

// 禁用默认右键菜单；输入框与可选文本区域放行，保留原生复制/粘贴
document.addEventListener(
  'contextmenu',
  (e) => {
    const el = e.target
    if (!(el instanceof Element)) return
    if (
      el.closest(
        'input, textarea, [contenteditable="true"], [contenteditable=""], .n-input, .selectable, .msg .bubble, .markdown-body',
      )
    ) {
      return
    }
    e.preventDefault()
  },
  {capture: true},
)

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')
