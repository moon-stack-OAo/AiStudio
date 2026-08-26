# Changelog

本文件遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)
格式，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

发版时 GitHub Release 说明会自动截取对应版本章节（见 `.github/workflows/release.yml`）。

## [Unreleased]

## [0.1.0]

### 新增

- 多轮对话（流式 SSE 输出），支持停止生成；回复支持 Markdown 渲染与代码高亮
- 对话上下文自动裁剪：发送时仅携带最近 N 轮（默认 20），本地记录完整保留；可在「设置 → 关于与更新」开关并调整上限；接近上限时对话页提示
- 文生图 / 图生图：数量、尺寸或比例、质量等参数；结果灯箱预览与原图下载
- 多提供商：OpenAI、xAI Grok、OpenAI 兼容中转；支持增删自定义提供商、恢复预设、测试连接
- 模型选择：从提供商 `/models` 拉取列表，可筛选或手输，支持刷新
- 会话管理：对话 / 生图会话新建、重命名、删除；对话可清空消息
- 本地持久化：配置与会话元数据存 `localStorage`，生图二进制存 IndexedDB
- 设置页拆分为「提供商」「关于与更新」；整体 UI 紧凑化
- 关于页：版本信息、自动检查更新、跳过版本、清除本地数据、关闭行为偏好、对话上下文裁剪设置
- 桌面端自定义标题栏（无边框：拖拽、最小化 / 最大化 / 关闭）
- 系统托盘：显示主窗口 / 退出；关闭时可选择退出或最小化到托盘（可记住）
- Tauri Updater：启动与设置页可检查更新，支持下载安装后自动重启
- 桌面端 API 经 `@tauri-apps/plugin-http` 直连上游（无 WebView CORS 限制）
- 浏览器开发代理（Vite `/api-proxy`），便于本地调试无 CORS 的中转站
- 响应式布局：窄屏侧栏折叠、移动端抽屉导航
- Windows Release 工作流：推送 `v*` tag 自动构建 NSIS / MSI 并上传 Updater 产物

### 说明

- 应用内自动更新、系统托盘、关闭确认仅桌面客户端可用
- 发版需配置仓库 Secrets：`TAURI_SIGNING_PRIVATE_KEY`、`TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
- Release 说明由本文件对应版本章节自动生成
