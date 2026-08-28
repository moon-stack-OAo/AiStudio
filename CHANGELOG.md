# Changelog

本文件遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)
格式，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

发版时 GitHub Release 说明会自动截取对应版本章节（见 `.github/workflows/release.yml`）。

## [Unreleased]

## [1.0.0]

首个功能完整里程碑：对话 / 生图 / 生视频、多提供商、Windows 桌面与 Android 侧载，以及双端应用内更新。

### 新增

- **对话**：流式 SSE、停止生成、Markdown / 代码高亮、消息复制；会话新建 / 重命名 / 删除 / 清空；可选上下文自动裁剪（最近 N 轮，本地全文保留）
- **对话撤回**：撤回用户消息及其后的 AI 回复；生成中撤回会中止请求（桌面右键菜单 + 按钮；Android 同步提供撤回入口）
- **生图**：文生图 / 图生图；数量、尺寸或比例、质量；气泡时间线、灯箱预览与下载、用作参考图、生成中可停止；支持粘贴剪贴板图片作参考
- **生视频**：OpenAI 兼容 `/videos` 与 xAI `/videos/generations`；文生 / 图生、进度与停止、会话恢复未完成任务、播放与下载（桌面 + Android）
- **多提供商**：OpenAI、xAI Grok、自定义 OpenAI 兼容中转；测试连接、远程拉取模型列表、恢复预设；密钥仅存本机
- **设置**：提供商 / 关于与更新；版本信息、自动检查更新、跳过版本、清除本地数据、对话上下文、深色 / 浅色主题；桌面另有关闭行为偏好
- **桌面端**：无边框自定义标题栏（最小化 / 最大化 / 关闭）、可缩放窗口；系统托盘（显示 / 打开对话 / 设置 / 检查更新 / 退出）；关闭可退出或最小化到托盘
- **自动更新**：桌面 Tauri Updater（`latest.json` + 签名）；Android 侧载清单 `android-latest.json`（检查 → 下载 APK → 系统安装器，可启动静默检查）
- **Android**：底栏 Tab（对话 / 生图 / 生视频 / 设置）、安全区与返回键分层关闭；媒体可保存到系统相册；CI 产出 arm64 正式签名 APK
- **持久化**：配置与会话元数据 → `localStorage`；生图二进制 → IndexedDB
- **发版**：推送 `v*` tag 自动构建 Windows NSIS / MSI 与 Android APK，并上传 Updater / 侧载清单到同一 GitHub Release

### 修复

- 浏览器开发代理流式转发，修复 SSE 被整包缓冲、无法边收边显
- SSE 结束时正确 `cancel` reader 并消费残留 buffer，减少丢末包与连接延迟释放
- 流式中途出错时保留已生成正文，错误信息单独展示且脱敏（避免泄露 Key / 过长响应体）
- 切换 / 新建 / 删除正在生成的会话时中止请求，避免全局 loading 卡住
- 生图远程资源经 `appFetch` 入库 / 下载 / 作参考，降低 CORS 导致丢图的概率
- 启动时将残留生图 `loading` 标为「上次异常中断」
- localStorage 写入失败时提示用户
- 提供商「测试连接」区分 401/403/404/429/5xx；未配置对话模型时不盲目回退
- 图生图 / 图生视频参考图上传前自动压缩（最长边 1280、JPEG 0.85），并优化 HTTP 413 提示
- 桌面 Generate 相关子组件 scoped 样式生效问题

### 安全

- API Key 落盘前本地混淆存储，读取时解密（兼容历史明文）
- `appFetch` 与开发代理拒绝云元数据等危险地址；代理仅允许 `http` / `https`
- Android 侧载更新校验 APK SHA256
- CSP：`script-src 'self'`；`connect-src` 因自定义 Base URL / 媒体地址保持较宽（有意为之）

### 体验

- 流式输出用 `requestAnimationFrame` 合并同帧 UI 更新与滚动
- 会话气泡限制宽度与断行，避免横向滚动；进入页自动滚底
- 对话 / 生图 / 生视频停止态按「当前会话是否在生成」判断，切会话不误锁输入
- 输入框与可选消息区域放行系统右键；其余界面禁用默认右键
- 桌面气泡右键：复制正文 / 复制错误信息 / 撤回等

### 说明

- 托盘、关闭确认、Tauri Updater 仅桌面可用；Android 使用侧载更新与系统安装器
- 发版需配置仓库 Secrets：`TAURI_SIGNING_PRIVATE_KEY`、`TAURI_SIGNING_PRIVATE_KEY_PASSWORD`、`ANDROID_KEY_ALIAS`、`ANDROID_KEY_PASSWORD`、`ANDROID_KEY_BASE64`
- Release 说明由本文件对应版本章节自动生成
