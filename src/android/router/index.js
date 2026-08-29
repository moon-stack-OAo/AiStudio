import {createRouter, createWebHashHistory} from 'vue-router'
import {createAppRoutes} from '@core/router/routes'

const routes = createAppRoutes({
  ChatView: () => import('@/views/ChatView.vue'),
  ImageView: () => import('@/views/ImageView.vue'),
  VideoView: () => import('@/views/VideoView.vue'),
  SettingsView: () => import('@/views/SettingsView.vue'),
})

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

export default router
