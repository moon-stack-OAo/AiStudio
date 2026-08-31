# AI Studio 架构说明

本文描述当前仓库的真实分层与扩展约定，便于后续去重与新提供商接入。内容以源码为准。

## 1. 项目定位

AI Studio 是**本地多模态 AI 客户端**：多轮对话、文生图 / 图生图、文生视频 / 图生视频。无自建后端密钥托管；配置与会话落在本机。

| 维度   | 说明                                               |
|------|--------------------------------------------------|
| 前端   | Vue 3 · Vite · Naive UI · Pinia · Vue Router     |
| 壳层   | Tauri 2                                          |
| 目标平台 | Windows 桌面 + Android（arm64 侧载 APK）；浏览器可用于 Web 开发 |

源码按端拆分：`src/core`（共享）· `src/desktop` · `src/android` · `src-tauri`（Rust / 原生插件）。

## 2. 目录分层

```
src/
  core/           # 双端共享：API、stores、providers、工具、少量通用组件
  desktop/        # Windows / 浏览器桌面壳：路由、视图、标题栏、托盘相关 UI
  android/        # Android 壳：底栏 Tab、返回键分层、移动布局视图
src-tauri/        # Tauri 配置、Rust、持久 Android 原生源（android/）与 gen/
```

### 2.1 `src/core`（应尽量收敛共享逻辑）

| 路径                                                                  | 职责                                                                                        |
|---------------------------------------------------------------------|-------------------------------------------------------------------------------------------|
| `api/client.js`                                                     | 对话 / 生图 / 生视频 HTTP 调用；消费 image/video adapters                                             |
| `stores/`                                                           | `chat` · `image` · `video` · `settings`（Pinia）                                            |
| `providers/profiles/`                                               | 协议能力声明（OpenAI / xAI / Agnes / openai-compatible）                                          |
| `providers/adapters/image\|video/`                                  | 按 profile 组装请求体 / 路径 / 轮询方式                                                               |
| `providers/resolveProfile.js` · `capabilities.js`                   | 解析 profile、对外暴露能力                                                                         |
| `utils/`                                                            | `http`（`appFetch`）、`secret`、版本、更新、主题、存储等                                                  |
| `composables/` · `components/` · `runtime/` · `styles/` · `router/` | 可复用组合式 API、共享 UI（如 `ComposerSendStop` / `ModelSelect`）、生成运行时、主题样式、共享路由表 `createAppRoutes` |

别名：`@core` → `src/core`（见 `vite.desktop.config.js` / `vite.android.config.js`）。

### 2.2 `src/desktop` / `src/android`

两端各自有 `main.js`、`App.vue`、`router/`、`views/`、`components/`、`composables/`、`styles/`。

- Vite 别名 `@` 分别指向 `src/desktop` 或 `src/android`。
- 构建产物：`dist-desktop`（默认桌面）、`dist-android`。
- 入口 HTML：`index.html`（桌面）、`index.android.html`。

**路由**（path/name 表在 `src/core/router/routes.js` 的 `createAppRoutes(views)`；各端 `router/index.js` 只负责 `createRouter` + 注入本端 `@/views/*`）：

| 路径          | name       | 视图             |
|-------------|------------|----------------|
| `/`         | —          | 重定向到 `/chat`   |
| `/chat`     | `chat`     | `ChatView`     |
| `/image`    | `image`    | `ImageView`    |
| `/video`    | `video`    | `VideoView`    |
| `/settings` | `settings` | `SettingsView` |

已共享到 core 的低风险 UI：`ComposerSendStop`（`withTooltip`）、`ModelSelect`（`sheet` / 刷新与断点）。页面业务状态机已抽 composable，两端仍各保留 View 壳：

- `useChatSession`：发送 / SSE 流式 / 停止 / 撤回 / 上下文 hint（右键菜单 vs 顶栏更多等留端侧）
- `useImageSession`：生图参数与能力选项、生成 / 停止、时间线写入、idb 图解析、参考图与 lightbox 状态（桌面 generate 子组件 / 右键菜单、Android 返回键分层与相册下载等留端侧）
- `useVideoSession`：生视频参数与能力选项、生成 / 停止 / 恢复、重试；内部复用 `useVideoGeneration.runGenerate`（下载与端侧 UI 留端侧）

### 2.3 `src-tauri`

- `tauri.conf.json`：桌面窗口、CSP、Updater、`frontendDist: ../dist-desktop`。
- `tauri.android.conf.json`：Android 专用配置。
- `src/`：托盘（`tray.rs`）、Android 更新 / 媒体保存桥接等。
- `android/`：**持久**原生源（`MainActivity.kt`、`UpdaterPlugin.kt`、`MediaSaverPlugin.kt` 等）；`gen/android` 被 `tauri android init` 覆盖后须再同步。

## 3. 主要 Stores

均在 `src/core/stores/`，双端共用：

| Store | 文件            | 要点                                               |
|-------|---------------|--------------------------------------------------|
| 对话    | `chat.js`     | 会话列表、消息、本地 `localStorage`                        |
| 生图    | `image.js`    | 会话 / 气泡时间线；二进制可走 IndexedDB                       |
| 生视频   | `video.js`    | 任务进度、未完成恢复等                                      |
| 设置    | `settings.js` | 提供商列表、主题、更新偏好、上下文裁剪等；API Key 经 `secret.js` 混淆后落盘 |

业务视图通过 Pinia 读写上述 store，经 `api/client.js` 访问上游。

## 4. Provider 扩展方式

### 4.1 分层

1. **Profile**（`src/core/providers/profiles/*.js`）  
   声明能力：聊天风格、尺寸模式、生图/生视频路径与轮询风格等。由 `getCapabilities(provider)` 按 `resolveProfile` 选择。

2. **Adapter**（`adapters/image/`、`adapters/video/`）  
   把 UI 选项变成具体请求（path、body、transport、timeout）。`api/client.js` 调用 `prepareGenerateImage` / `prepareEditImage`、`prepareCreateVideoJob` / `preparePollVideoJob` 等。

3. **解析**（`resolveProfile.js`）  
   返回 `'openai' | 'xai' | 'agnes' | 'openai-compatible'`。Agnes 可按 baseUrl / 模型名优先识别。

当前内置预设见 `settings.js` 的 `PRESETS`（OpenAI、xAI）；自定义项默认 `provider: 'openai-compatible'`。

### 4.2 如何加新提供商（步骤）

若新上游与现有 OpenAI 兼容协议一致，**优先**让用户添加「自定义兼容」提供商，不必改代码。

若协议或参数与现有 profile 不同，建议按下列步骤扩展：

1. 在 `src/core/providers/profiles/` 新增 `yourProvider.js`，导出 `getYourProviderCapabilities()`（结构对齐 `openai.js` / `xai.js`）。
2. 在 `resolveProfile.js` 增加识别分支；在 `capabilities.js` 的 `switch` 中挂上该 profile。
3. 若生图请求形态不同：在 `adapters/image/` 新增适配器，并在 `adapters/image/index.js` 的 `getAdapter` 中分发。
4. 若生视频创建 / 轮询不同：在 `adapters/video/` 同样新增并分发；注意 `shouldFetchVideoContent` 是否需补拉 `/content`。
5. 如需出现在「内置预设」：在 `settings.js` 的 `PRESETS` 增加一项（`builtin: true`），并补齐默认模型名。
6. 如有提供商特有的尺寸/时长规范化：可放在对应 profile 模块，并由 `providers/index.js` 按需 re-export（参考 Agnes）。
7. 跑通：浏览器或 `tauri:dev` 下测试连接、对话流式、生图、生视频；执行 `npm run lint` 与 `npm run test`。

**不要**把仅某一端 UI 的差异塞进 adapters；adapters 只负责协议与请求组装。

## 5. 网络

### 5.1 `appFetch`（`src/core/utils/http.js`）

- **Tauri 运行时**：`@tauri-apps/plugin-http` 的 `fetch`，绕过 WebView CORS；并清空 `Origin`（避免部分上游拒请求）。
- **浏览器**：原生 `fetch`。
- 调用前执行 `assertSafeFetchUrl`：仅允许 `http`/`https`（相对路径、`blob:`、`data:` 放行）；拒绝常见云元数据主机（如 `169.254.169.254`、`metadata.google.internal`）。

`api/client.js`、媒体下载、Android 更新清单拉取等统一走 `appFetch`。

### 5.2 浏览器开发代理

- Vite 插件：`vite.shared.js` 中的 `corsProxyPlugin`。
- 路径：`/api-proxy/*`，真实 Base URL 由请求头 `X-Proxy-Target` 指定。
- 设置里「开发代理」（`useCorsProxy`）仅对浏览器开发有意义；`tauri:dev` / 打包版直连上游，无需该开关。
- 代理侧同样拦截危险主机，降低 SSRF 面（**前端兜底，不能替代对中转站的信任判断**）。

## 6. 密钥

`src/core/utils/secret.js`：

- 写入 `localStorage` 前用固定密钥做 **XOR + Base64**，前缀 `enc:v1:`。
- **明确不是强加密**：无法抵御本机恶意软件或有权读取存储的攻击者；目的仅为避免明文一眼可见。
- 读取时兼容历史明文。详见 [`SECURITY.md`](../SECURITY.md)。

## 7. 双端差异

| 能力      | 桌面（`src/desktop` + Rust）                      | Android（`src/android` + 原生插件）                                    |
|---------|-----------------------------------------------|------------------------------------------------------------------|
| 导航      | 侧栏 / 工作区壳 + 自定义无边框标题栏（`TitleBar`）             | 底部 Tab 栏（`App.vue`）；软键盘弹起时收起底栏                                   |
| 关闭 / 返回 | 关闭行为：退出 / 托盘；`tray.rs` + `TrayActionListener` | `useBackCloseLayer`：层打开时 `pushState`，物理返回先关层                     |
| 更新      | Tauri Updater + GitHub `latest.json`          | 侧载：`android-latest.json` + `UpdaterPlugin` / `androidUpdater.js` |
| 媒体      | 常规下载                                          | `MediaSaverPlugin` 保存到相册                                         |
| 安全区     | 常规窗口                                          | `MainActivity` Bridge + `safeArea.js` 注入 CSS 变量                  |
| 前端构建    | `build:desktop` → `dist-desktop`              | `build:android` → `dist-android`                                 |

共享业务（stores、API、providers）应留在 `core`；壳层交互、布局、原生桥接留在各端或 `src-tauri`。

## 8. 构建与发版流水线

| 工作流                                                                 | 触发                                 | 作用                                                                                                                                 |
|---------------------------------------------------------------------|------------------------------------|------------------------------------------------------------------------------------------------------------------------------------|
| [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)           | PR / 推送到 `main` · `master` · `dev` | Node 20：`check:theme`、`lint`、`test`、双端 Vite build；另 job `cargo check`（不做完整 Tauri 打包）。`format:check` 脚本已有，CI 中暂注释（待格式化 PR）          |
| [`.github/workflows/release.yml`](../.github/workflows/release.yml) | 推送 `v*` tag                        | Windows：NSIS/MSI + Updater 签名与 `latest.json`；Android：init → 同步原生源 → 正式签名 APK + `android-latest.json`；Release 正文从 `CHANGELOG.md` 截取 |

日常开发与合入**依赖 ci.yml**；不要指望只靠发版流水线发现前端 / 主题 / lint 问题。

本地常用命令见 [`CONTRIBUTING.md`](../CONTRIBUTING.md)。

## 9. 维护原则：哪些必须分叉、哪些应进 core

为后续去重做铺垫，约定如下。

### 应放进 `src/core`（或已在 core 则避免再复制）

- 上游协议、请求组装、错误文案与超时常量
- Pinia stores 与持久化键约定
- `appFetch` / 代理头 / 密钥混淆 / 版本号读取
- 与壳无关的 composables（如复制反馈、主题应用、媒体下载核心逻辑）
- Provider profiles 与 adapters

### 必须（或合理）分叉在 desktop / android

- 路由入口（`createRouter` + 本端 views 注入）与页面布局（侧栏 vs 底栏）
- 标题栏、托盘、关闭确认 vs 返回键分层、安全区、软键盘避让
- 更新 UI 与安装路径（桌面 Updater vs Android 侧载）
- 仅一端需要的组件（如 `TitleBar`、`TrayActionListener`、Android `SessionHistoryButton`）
- Vite / HTML 入口与 `outDir`

### 原生与 CI

- 持久 Kotlin / 资源放 `src-tauri/android/`，**不要**只改 `gen/android`
- `tauri android init` 之后必须：`node .github/scripts/sync-android-updater-sources.mjs`
- 签名密钥、keystore **永不**进仓库

### 去重时注意

两端若出现大段相同的 `views/` / `components/`，优先抽到 `core` 或抽共享子组件，再由各端壳组装；**不要**为了「少一个文件」把托盘或底栏逻辑塞进 core。

## 10. 样式分层与密度 Token

原则：**结构一份、密度两套**——选择器与布局意图相同的规则下沉到 `src/core/styles/*-base.scss`；两端仅数值不同的间距 / 圆角 / 字号走 CSS 变量，由端侧覆写，**不要**为「统一」硬抹平 Desktop 偏松与 Android 偏紧的差异。

| 层级    | 路径                                                             | 职责                                                                            |
|-------|----------------------------------------------------------------|-------------------------------------------------------------------------------|
| Token | `src/core/styles/tokens.scss`                                  | 色板、通用 `--space-*` / `--radius-*`，以及会话 / 生成区密度变量默认值（= Desktop）                 |
| Base  | `session-workspace-base.scss` · `generate-workspace-base.scss` | 同构规则（气泡、composer、gallery、params 等）消费 `var(--...)`                             |
| 端侧密度  | `desktop/styles/main.scss` · `android/styles/main.scss`        | Android 全局覆写偏紧；Desktop 在 `@media` 窄屏覆写（须放**非 scoped** 全局样式，避免 Vue 改写 `:root`） |
| 端侧分叉  | `*/styles/session-workspace.scss` · `generate-workspace.scss`  | 仅结构差异：侧栏/底栏、hover 显隐、桌面 toolbar / opt-group、Android 顶栏标题等                     |

改主题色仍须同步 `theme.js` 的 `PALETTE`，并跑 `npm run check:theme`。
