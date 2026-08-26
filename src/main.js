import {createApp} from 'vue'
import {createPinia} from 'pinia'
import App from './App.vue'
import router from './router'
import './styles/main.scss'
import {startSyncClient} from '@/utils/syncClient'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')

// Pinia 就绪后启动二期状态同步（桌面 / 经本地服务打开的浏览器）
startSyncClient().catch((e) => {
  console.warn('[sync] 启动失败', e)
})
