import {createApp} from 'vue'
import {createPinia} from 'pinia'
import App from './App.vue'
import router from './router'
import './styles/main.scss'
import {applyAndroidSafeAreaInsets} from '@core/utils/safeArea'
import {initAppLogger} from '@core/utils/logger'

applyAndroidSafeAreaInsets()
initAppLogger()

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')
