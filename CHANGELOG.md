# Changelog

本文件遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)
格式，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

发版时 GitHub Release 说明会自动截取对应版本章节（见 `.github/workflows/release.yml`）。

## [Unreleased]

## [1.0.5]

### 新增

- **媒体持久化守卫**：生图 / 生视频会话写入 `localStorage` 前按体积与条数预算裁剪，失败时降级重试并提示（对齐对话 `chatPersist`）
- **Rust URL 硬拦**：Tauri `http` capabilities 增加与前端一致的元数据 / 链路本地等 `deny`；Android 媒体下载复用 `url_safety`（含重定向后校验）

### 修复

- **对话清空**：清空消息时中止进行中的流式请求并释放 `busy`，避免发送被锁死
- **浏览器出网**：axios JSON API 统一经 `appFetch`，开发态也会执行 `assertSafeFetchUrl`
- **错误脱敏**：补充裸 `sk-` / `xai-` / `gsk_` 等形态；API 抛错与视频 toast 统一走脱敏；axios 拦截器不再挂带 Authorization 的完整 response
- **生视频 busy / resume**：对外 busy 统一看 `generationRuntime`；纯 `pending_resume` 不锁发送区；generate/retry 与 `canGenerate` 对齐；切页仅中止自动 resume、不打断跨页生成

### 变更

- **生视频状态机拆分**：`useVideoResume` / `useVideoJobRunner` / `useVideoPlayback` / `useVideoComposerParams`，门面 API 保持稳定
- **双端展示工具下沉**：日期标签、时间线分组、视频下载 URL 解析抽到 core，减少 Image/Video View 重复
- **界面**：双端会话工作区 / 生成区样式与 Android 组件结构优化（含 SessionTopBar 等）

## [1.0.4]

### 新增

- **桌面标题栏 / 托盘**：显示应用版本号（如 `AI Studio v1.0.4`）

### 修复

- **生图下载**：桌面另存为优先从 IndexedDB 读取 Blob，并回退 `remoteUrl`，修复 Agnes 等已缓存图保存时报 `Failed to fetch`
- **桌面更新**：下载安装遇瞬时网络失败时自动重试；安装前重新检查更新，避免复用失效的 Update 对象
- **桌面更新**：静默弹窗点「稍后」后，关于页可直接显示并安装；「关于与更新」Tab 增加可用更新红点；跳过版本时清空关于页安装入口

### 变更

- **Android 设置**：外观 / 对话 / 提供商等页面改为复用 core 设置组件，减少双端重复实现
- **API 分层**：将 chat / image / video / http / errors 从臃肿 `client.js` 拆出，便于维护与单测

## [1.0.3]

### 新增

- **桌面下载**：图片 / 视频下载改为系统「另存为」对话框（Tauri dialog + fs），不再静默落入 Downloads
- 视频下载源增加 `remoteVideoUrl` 兜底，降低 blob 失效导致无法保存的概率

### 变更

- **Dependabot**：优化分组与限额；Tauri 前后端单独分组；忽略 `sha2` / `reqwest` major，减少噪音与风险 PR

## [1.0.2]

### 新增

- **生视频**：失败条目可重试；`pending_resume` 支持手动「恢复轮询 / 放弃」；图生可空提示词；xAI 清晰度档位（480p/720p/1080p）；参考图预览与错误复制（桌面 + Android）
- **提示词**：示例标签改为按 AI 现生成提示词
- **生图**：缩略图按生成比例显示；Agnes 尺寸档位扩展

### 修复

- 修复中转站返回 `/v1/videos/{id}/content` 相对路径时，生成完成后无法播放（优先直链，否则鉴权拉流为 blob）
- 修复视频恢复轮询与停止/busy 脱节、轮询无超时导致长期挂起
- 修复图生参考图缩略图易丢失、失败无法回填参数重试
- 修复设为参考图因 MIME 被拒
- 修复对话发送与流式、生图/生视频对齐贴底跟随
- 修复提示词优化取消与转圈状态

### 变更

- **提供商**：文档与设置文案不再将 Agnes 与 OpenAI / xAI 并列展示；仍按 URL / 模型名自动识别

## [1.0.1]

### 新增

- **提示词优化**：优化过程支持取消；请求超时与最大输出令牌限制，避免长时间挂起；按钮文案随状态切换

### 修复

- 修复 Android 更新清单生成，并更正仓库更新地址
- 修复 CI 中 Prettier 格式校验，并补齐 Ubuntu Tauri 构建依赖
- 修复桌面端 CSP `media-src` 未放行 http(s)，导致 Agnes 等远程视频链接无法播放

## [1.0.0]

首个功能完整里程碑：对话 / 生图 / 生视频、多提供商、Windows 桌面与 Android 侧载，以及双端应用内更新。

### 新增

- **对话**：流式 SSE、停止生成、Markdown / 代码高亮、消息复制；会话新建 / 重命名 / 删除 / 清空；可选上下文自动裁剪（轮数 + 字符预算双上限，本地全文保留）
- **对话参数**：温度、系统提示、Max Tokens（0 = 不限制）、请求超时（5–600 秒）；设置独立「对话」Tab
- **本会话参数**：对话页可为当前会话单独覆盖 Temperature / System Prompt（未开启则跟随全局）
- **对话撤回**：撤回用户消息及其后的 AI 回复；生成中撤回会中止请求（桌面右键菜单 + 按钮；Android 同步提供撤回入口）
- **后台生成**：切页 / 切会话不中止请求；切回后仍可停止；桌面 keep-alive 缓存页自动滚底
- **生图**：文生图 / 图生图；数量、尺寸或比例、质量；气泡时间线、灯箱预览与下载、用作参考图、生成中可停止；支持粘贴剪贴板图片作参考
- **生视频**：OpenAI 兼容 `/videos`、xAI `/videos/generations`、Agnes APIHub；文生 / 图生、进度与停止、会话恢复未完成任务、播放与下载（桌面 + Android）
- **提示词辅助**：生图 / 生视频示例模板与随机填入、按维度结构化拼装、对话模型 AI 优化并回填编辑区；Android 输入区布局优化（发送键移至底栏右侧）
- **多提供商**：OpenAI、xAI Grok、Agnes（按 URL / 模型名自动识别）、自定义 OpenAI 兼容中转；测试连接、远程拉取模型列表、恢复预设；密钥仅存本机
- **外观**：设置独立「外观」Tab；主题浅色 / 深色 / 跟随系统；界面字号与舒适 / 紧凑密度（桌面 + Android）
- **设置**：提供商 / 对话 / 外观 / 关于与更新；版本信息、自动检查更新、跳过版本、清除本地数据（可分粒度）；设置 JSON 导入导出（含外观与对话高级参数，可选含 Key，导入含 Key 二次确认）；桌面另有关闭行为偏好
- **桌面端**：无边框自定义标题栏（最小化 / 最大化 / 关闭）、可缩放窗口；系统托盘（显示 / 打开对话 / 设置 / 检查更新 / 退出）；关闭可退出或最小化到托盘
- **自动更新**：桌面 Tauri Updater（`latest.json` + 签名）；Android 侧载清单 `android-latest.json`（检查 → 下载 APK → 系统安装器，可启动静默检查）
- **Android**：底栏 Tab（对话 / 生图 / 生视频 / 设置）、安全区与返回键分层关闭；媒体可保存到系统相册；CI 产出 arm64 正式签名 APK
- **持久化**：配置与会话元数据 → `localStorage`；生图二进制 → IndexedDB
- **工程化**：日常 CI、Vitest、ESLint / Prettier（含 format 校验）、Dependabot；MIT 许可与安全说明；架构 / 贡献文档；双端共享路由与会话 composable
- **发版**：推送 `v*` tag 自动构建 Windows NSIS / MSI 与 Android APK，并上传 Updater / 侧载清单到同一 GitHub Release

### 修复

- 浏览器开发代理流式转发，修复 SSE 被整包缓冲、无法边收边显
- SSE 结束时正确 `cancel` reader 并消费残留 buffer，减少丢末包与连接延迟释放
- 流式中途出错时保留已生成正文，错误信息单独展示且脱敏（避免泄露 Key / 过长响应体）
- 生成停止失效；列表自动滚底与切页滚底补延迟重试，避免差一截不到底
- 生图远程资源经 `appFetch` 入库 / 下载 / 作参考，降低 CORS 导致丢图的概率
- 启动时将残留生图 `loading` 标为「上次异常中断」
- localStorage 写入失败时提示用户
- 提供商「测试连接」区分 401/403/404/429/5xx；未配置对话模型时不盲目回退
- 图生图 / 图生视频参考图上传前自动压缩（最长边 1280、JPEG 0.85），并优化 HTTP 413 提示
- 桌面 Generate 相关子组件 scoped 样式生效问题
- 入口页浅色冷启动闪屏；同步 `color-scheme` 与主题色校验

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
- 工作区样式密度 Token 化；双端页面逻辑下沉至共享 composable，端侧仅保留壳层

### 说明

- 托盘、关闭确认、Tauri Updater 仅桌面可用；Android 使用侧载更新与系统安装器
- 发版需配置仓库 Secrets：`TAURI_SIGNING_PRIVATE_KEY`、`TAURI_SIGNING_PRIVATE_KEY_PASSWORD`、`ANDROID_KEY_ALIAS`、`ANDROID_KEY_PASSWORD`、`ANDROID_KEY_BASE64`
- 仓库以 `.gitattributes` 统一文本文件为 LF，避免 Windows `core.autocrlf` 产生无实质改动的假脏文件
- Release 说明由本文件对应版本章节自动生成
