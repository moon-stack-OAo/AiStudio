import {createApp} from 'vue'
import {createPinia} from 'pinia'
import App from './App.vue'
import router from './router'
import './styles/main.scss'

// 禁用 WebView / 浏览器默认右键菜单（桌面端更像原生应用）
document.addEventListener(
  'contextmenu',
  (e) => {
    e.preventDefault()
  },
  { capture: true },
)

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')
