# Changelog

本文件遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)
格式，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

发版时 GitHub Release 说明会自动截取对应版本章节（见 `.github/workflows/release.yml`）。

## [Unreleased]

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
