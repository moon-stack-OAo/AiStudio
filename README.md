# AI Studio

本地多模态 AI 客户端：多轮对话、文生图 / 图生图、文生视频 / 图生视频。支持 OpenAI、xAI Grok 与任意 OpenAI 兼容接口。

可用浏览器进行 Web 开发，也可通过 Tauri 2 打包为 Windows 桌面应用，并由 CI 产出可侧载的 Android APK（arm64）。

当前版本： **1.0.2**（变更详见 [`CHANGELOG.md`](./CHANGELOG.md)）。

## 功能概览

| 模块          | 能力                                                                                          |
|-------------|---------------------------------------------------------------------------------------------|
| **对话**      | 流式 SSE、停止 / 后台继续生成、Markdown / 代码高亮、复制；撤回；会话 CRUD；上下文双上限；温度 / 系统提示 / Max Tokens / 超时；本会话参数覆盖 |
| **生图**      | 文生图 / 图生图；数量、尺寸或比例、质量；气泡时间线、灯箱、下载、用作参考图、粘贴剪贴板图片；生成中可停止；提示词辅助                                |
| **生视频**     | 文生 / 图生（OpenAI / xAI / Agnes）；进度与停止、恢复未完成任务、播放与下载；提示词辅助（桌面 + Android）                       |
| **提供商**     | OpenAI / xAI / Agnes（URL·模型自动识别）/ 自定义兼容中转；测试连接、拉取模型列表、密钥仅存本机                                |
| **设置**      | 提供商 / 对话 / 外观 / 关于与更新；主题（含跟随系统）、字号与密度、清数据、设置导入导出；桌面关闭行为；双端检查更新                              |
| **桌面**      | 无边框标题栏、可缩放窗口、系统托盘、Tauri Updater                                                             |
| **Android** | 底栏 Tab、安全区、返回键分层关闭、侧载更新、媒体保存到相册                                                             |
| **持久化**     | 配置与会话 → `localStorage`；生图二进制 → IndexedDB                                                    |

## 技术栈

- **前端**：Vue 3 · Vite · Naive UI · Pinia · Vue Router
- **桌面 / 移动**：Tauri 2（Windows + Android）
- **持久化**：`localStorage` / IndexedDB

源码按端拆分：`src/core`（共享业务）· `src/desktop` · `src/android` · `src-tauri`（Rust / 原生插件）。架构说明见 [`docs/architecture.md`](./docs/architecture.md)；贡献与发版检查见 [`CONTRIBUTING.md`](./CONTRIBUTING.md)。

## 快速开始（Web）

```bash
npm install
npm run dev
```

浏览器打开终端提示的地址（默认 `http://localhost:5173`）。

```bash
npm run build
npm run preview
```

> 访问无 CORS 的中转站时，请在「设置 → 提供商」开启「开发代理」。`tauri:dev` / 打包版无需该开关。

## 桌面端（Tauri 2）

### 环境要求

| 依赖               | 说明                                        |
|------------------|-------------------------------------------|
| Node.js          | 18+（CI 使用 20）                             |
| Rust             | [rustup](https://rustup.rs/)              |
| Windows WebView2 | Win10/11 通常已预装                            |
| MSVC 构建工具        | Visual Studio Build Tools（「使用 C++ 的桌面开发」） |

```bash
node -v && npm -v && rustc --version && cargo --version
```

### 开发 / 打包

```bash
npm install
npm run tauri:dev         # Vite + 原生窗口
npm run tauri:build       # 默认打包
npm run tauri:build:win   # Windows：NSIS + MSI
npm run tauri:build:check # 检查安装包 / 签名产物
```

本地完整打包（需签名密钥，与 CI 相同）：

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content -LiteralPath "$env:USERPROFILE\.tauri\ai-studio.key" -Raw
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = Get-Content -LiteralPath "$env:USERPROFILE\.tauri\ai-studio.key.password" -Raw
npm run tauri:build:win
npm run tauri:build:check
```

产物目录：`src-tauri/target/release/bundle/`（`nsis/`、`msi/`，以及对应 `.sig`）。

- 桌面前端产物：`dist-desktop`（`npm run build:desktop`）
- Android 前端产物：`dist-android`（`npm run build:android`）
- 默认窗口约 1280×840，最小约 1024×720，可拖边缩放；无系统边框（自定义标题栏）

## Android（Tauri 2 Mobile）

推送 `v*` tag 时，CI 会在 Ubuntu 上初始化 Android 工程并构建 **arm64（aarch64）正式签名 APK**，上传到同一 GitHub Release。无需本机安装 Android SDK；本机有完整 SDK 时可本地构建。

### 本机环境（可选）

| 依赖          | 说明                                                                                                      |
|-------------|---------------------------------------------------------------------------------------------------------|
| JDK 17+     | Temurin / Oracle 等                                                                                      |
| Android SDK | `platforms;android-34`、Build-Tools、NDK 27.x                                                             |
| 环境变量        | `ANDROID_HOME`、`NDK_HOME`                                                                               |
| Rust target | `rustup target add aarch64-linux-android`                                                               |
| 正式签名        | 配置 `src-tauri/gen/android/keystore.properties`（见 [签名文档](https://v2.tauri.app/distribute/sign/android/)） |

```bash
npm run tauri:android:init
node .github/scripts/sync-android-updater-sources.mjs   # init 后必跑
npm run tauri:build:android:debug   # debug APK
npm run tauri:build:android         # release APK（需 keystore）
```

> 本地若无 SDK，`android init` 可能失败， **不影响发版**（CI 每次 Release 会按需 init）。
>
> 持久原生源在 `src-tauri/android/`（`MainActivity.kt`、`UpdaterPlugin.kt`、`MediaSaverPlugin.kt`、`file_paths.xml`）。`gen/android` 被 init 覆盖后必须重新同步，否则安全区 Bridge、侧载更新与相册保存会丢失。

### 配置摘要

- 应用名：`AI Studio` · Bundle ID：`com.moon.aistudio`
- 桌面 Updater：GitHub Releases `latest.json`
- Android 更新清单：GitHub Releases `android-latest.json`（侧载，非官方 Updater 格式）
- 桌面 API 经 `@tauri-apps/plugin-http` 直连上游（无 WebView CORS）

## 使用说明

1. 「设置 → 提供商」填写 Base URL、API Key，选择或拉取对话 / 生图 / 生视频模型（可测试连接）
2. 在「对话」「生图」或「生视频」中切换提供商与模型后使用（Enter 发送 / 生成，Shift+Enter 换行；生成中可停止；切页后任务可继续，切回仍可停止）
3. 生图 / 生视频可用示例模板、结构化拼装或「AI 优化」完善提示词（优化走当前对话模型）
4. 「设置 → 对话」可调温度 / 系统提示 / Max Tokens / 超时与上下文双上限，以及设置导入导出；对话页可为本会话单独覆盖温度与系统提示
5. 「设置 → 外观」可调主题（浅色 / 深色 / 跟随系统）、字号与密度；「关于与更新」可检查更新、清除本地数据（桌面另有关闭行为 / 托盘；Android 为侧载 APK）

### 预设示例

| 提供商      | Base URL                    | 对话示例       | 生图示例                       | 生视频示例                |
|----------|-----------------------------|------------|----------------------------|----------------------|
| OpenAI   | `https://api.openai.com/v1` | `gpt-4o`   | `gpt-image-1` / `dall-e-3` | `sora-2`             |
| xAI Grok | `https://api.x.ai/v1`       | `grok-4.5` | `grok-imagine-image`       | `grok-imagine-video` |
| Agnes    | 按 Agnes APIHub 文档           | 按文档        | Agnes Image 2.x            | Agnes Video 2.5      |
| 兼容中转     | 你的中转地址 `/v1`                | 按中转文档      | 按中转文档                      | 按中转文档                |

## 接口约定

- 对话：`POST /chat/completions`（流式 SSE）
- 文生图：`POST /images/generations`
- 图生图：
    - OpenAI / 兼容：`multipart/form-data` → `/images/edits`
    - xAI：`application/json` → `/images/edits`
- 生视频：
    - OpenAI 兼容：`/videos`（创建任务 + 轮询）
    - xAI：`/videos/generations`（创建任务 + 轮询）
    - Agnes：`/videos` + 网关根路径轮询（按 URL / 模型名自动识别）

## 发版与自动更新

变更记录见 [`CHANGELOG.md`](./CHANGELOG.md)。推送 `v*` tag 时，CI 会：

1. 从 `CHANGELOG.md` 截取对应版本说明写入 GitHub Release
2. 构建 Windows 安装包（NSIS / MSI），签名并上传 Updater 产物（含 `latest.json`）
3. 构建 Android APK（arm64，正式签名），上传 APK 与 `android-latest.json` 到 **同一** Release

典型资产：Windows NSIS / MSI（及 `.sig`）、`latest.json`、Android `.apk`、`android-latest.json`。

### 仓库 Secrets

| Secret                               | 说明                               |
|--------------------------------------|----------------------------------|
| `TAURI_SIGNING_PRIVATE_KEY`          | **必需**（Windows Updater）：更新签名私钥全文 |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | **必需**（Windows Updater）：私钥密码     |
| `ANDROID_KEY_ALIAS`                  | **必需**（Android）：Keystore alias   |
| `ANDROID_KEY_PASSWORD`               | **必需**（Android）：密钥密码             |
| `ANDROID_KEY_BASE64`                 | **必需**（Android）：`.jks` 的 base64  |

> CI 会写入 `keystore.properties` 并注入 Gradle release 签名。本地 keystore 请自行备份，勿提交仓库。

本地生成 Updater 密钥（勿提交私钥）：

```bash
npm run tauri signer generate -w ~/.tauri/ai-studio.key
```

### 发版步骤

1. 更新 `CHANGELOG.md`（`## [x.y.z]`）
2. 同步版本号：`package.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml`、`src/core/utils/version.js`
3. 提交并推送后打 tag：

```bash
git tag v1.0.1
git push origin v1.0.1
```

> Updater 按版本号比较；已发布版本请勿覆盖同名 tag，应升版本再发。示例中的版本号请按实际发版替换。

## 常见问题

**`tauri:dev` 找不到 rustc / cargo**  
先安装 Rust（rustup），重开终端后再试。

**Windows 缺少 link.exe**  
安装 Visual Studio Build Tools，勾选「使用 C++ 的桌面开发」。

**浏览器 `net::ERR_FAILED` / CORS**  
开发态开启「开发代理」；或直接用 `npm run tauri:dev`（桌面端直连上游）。

**检查更新失败 / 没有更新**

- 桌面：确认已发带签名产物与 `latest.json` 的 Release，且应用版本低于最新版。
- Android：确认 Release 含 `android-latest.json` 与对应 APK；首次安装需允许「安装未知应用」。

**Android init 后更新 / 相册 / 安全区异常**  
重新执行：`node .github/scripts/sync-android-updater-sources.mjs`。

## 许可与安全

本项目采用 [MIT License](./LICENSE)。安全披露与已知安全模型见 [SECURITY.md](./SECURITY.md)。参与开发请阅读 [CONTRIBUTING.md](./CONTRIBUTING.md)。
