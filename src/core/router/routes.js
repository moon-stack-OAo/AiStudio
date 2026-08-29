/**
 * 双端共享路由表（path / name）。
 * 组件由各端注入：Vite `@` 分别指向 desktop / android 的 views。
 *
 * @param {{ ChatView: import('vue').Component | (() => Promise<any>), ImageView: import('vue').Component | (() => Promise<any>), VideoView: import('vue').Component | (() => Promise<any>), SettingsView: import('vue').Component | (() => Promise<any>) }} views
 */
export function createAppRoutes(views) {
  return [
    {
      path: '/',
      redirect: '/chat',
    },
    {
      path: '/chat',
      name: 'chat',
      component: views.ChatView,
    },
    {
      path: '/image',
      name: 'image',
      component: views.ImageView,
    },
    {
      path: '/video',
      name: 'video',
      component: views.VideoView,
    },
    {
      path: '/settings',
      name: 'settings',
      component: views.SettingsView,
    },
  ]
}
