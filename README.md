# AI Studio

本地 AI 客户端：多轮对话、文生图、图生图。支持 OpenAI / xAI Grok / 任意 OpenAI 兼容接口。

可在浏览器中以 Web 方式开发，也可通过 Tauri 2 打包为桌面应用（自定义标题栏、系统托盘、应用内自动更新），并可通过 CI 产出可侧载的 Android APK（arm64）。

当前版本：**0.1.1**（变更详见 [`CHANGELOG.md`](./CHANGELOG.md)）。

## 功能概览

- **对话**：流式 SSE、停止生成、Markdown / 代码高亮、消息复制；会话新建 / 重命名 / 删除 / 清空；可选上下文自动裁剪（最近 N 轮）
- **生图**：文生图 / 图生图，数量、尺寸或比例、质量；气泡时间线（提示词可复制）、灯箱预览与下载、用作参考图、生成中可停止
- **多提供商**：OpenAI、xAI、兼容中转；测试连接、远程拉取模型列表、自定义提供商；密钥仅存本机
- **持久化**：配置与会话元数据 → `localStorage`；生图二进制 → IndexedDB
- **设置**：提供商 / 关于与更新；关于页含版本、自动检查更新、跳过版本、清数据、关闭行为、对话上下文
- **桌面端**：无边框自定义标题栏；系统托盘（显示 / 打开对话 / 设置 / 检查更新 / 退出）；关闭时可退出或最小化到托盘（可记住）
- **自动更新**：Tauri Updater（检查 → 下载安装 → 重启）

## 技术栈

- Vue 3 + Vite + Naive UI
- Pinia + Vue Router
- `localStorage` / IndexedDB 持久化
- Tauri 2（可选桌面 / Android 打包）

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

## 桌面端（Tauri 2）

### 环境要求

| 依赖               | 说明                                        |
|------------------|-------------------------------------------|
| Node.js          | 建议 18+                                    |
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
npm run tauri:build:win   # Windows：NSIS + MSI（本地完整打包测试）
npm run tauri:build:check # 检查安装包 / 签名产物是否生成
```

本地完整打包（需签名密钥，与 CI 相同）：

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content -LiteralPath "$env:USERPROFILE\.tauri\ai-studio.key" -Raw
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = Get-Content -LiteralPath "$env:USERPROFILE\.tauri\ai-studio.key.password" -Raw
npm run tauri:build:win
npm run tauri:build:check
```

产物目录：`src-tauri/target/release/bundle/`（`nsis/`、`msi/`，以及对应 `.sig`）。

- `tauri:dev` 会先跑 `npm run dev`，再加载 `http://localhost:5173`
- `tauri:build` 会先跑 `npm run build`，再打包 `dist`
- 纯 Web 开发仍可用 `npm run dev` / `npm run build`

## Android（Tauri 2 Mobile）

推送 `v*` tag 时，CI 会在 Ubuntu 上初始化 Android 工程并构建 **arm64（aarch64）正式签名 APK**，上传到同一 GitHub Release。无需本机安装 Android SDK；本机有完整 SDK 时可本地构建。

### 本机环境（可选）

| 依赖 | 说明 |
|------|------|
| JDK 17+ | Temurin / Oracle 等 |
| Android SDK | `platforms;android-34`、Build-Tools、NDK 27.x |
| 环境变量 | `ANDROID_HOME`、`NDK_HOME` |
| Rust target | `rustup target add aarch64-linux-android` |
| 正式签名 | 配置 `src-tauri/gen/android/keystore.properties`（见 [签名文档](https://v2.tauri.app/distribute/sign/android/)） |

```bash
npm run tauri:android:init          # 生成 src-tauri/gen/android（--ci）
npm run tauri:build:android:debug   # debug 签名 APK（本地调试）
npm run tauri:build:android         # release APK（需 keystore.properties）
```

> 本地若无 SDK，`android init` 可能失败；**不影响发版**：CI 会在每次 Release 时执行 `tauri android init --ci`，并使用仓库 Secrets 正式签名。

### 配置摘要

- 应用名：`AI Studio` · Bundle ID：`com.moon.aistudio`
- 默认窗口：1280×800（最小 960×640），无系统边框（自定义标题栏）
- Updater 端点：GitHub Releases `latest.json`
- CSP 已放行 `https:` / `http:` 的 `connect-src`
- 桌面端 API 请求走 `@tauri-apps/plugin-http`（Rust），不依赖上游 CORS

## 使用说明

1. 「设置 → 提供商」填写 Base URL、API Key，并选择或拉取对话 / 生图模型（可测试连接）
2. 「对话」或「生图」中切换提供商与模型后使用（Enter 发送 / 生成，Shift+Enter 换行；生图生成中可停止）
3. 「设置 → 关于与更新」可检查并安装更新、调整关闭行为 / 对话上下文、清除本地数据（更新 / 托盘仅桌面端）

> 浏览器 `npm run dev` 访问无 CORS 的中转站时，请开启设置里的「开发代理」。`tauri:dev` / 打包版无需该开关。

### 预设示例

| 提供商      | Base URL                    | 对话模型示例     | 生图模型示例                     |
|----------|-----------------------------|------------|----------------------------|
| OpenAI   | `https://api.openai.com/v1` | `gpt-4o`   | `gpt-image-1` / `dall-e-3` |
| xAI Grok | `https://api.x.ai/v1`       | `grok-4.5` | `grok-imagine-image`       |
| 兼容中转     | 你的中转地址 `/v1`                | 按中转文档      | 按中转文档                      |

## 接口约定

- 对话：`POST /chat/completions`（流式 SSE）
- 文生图：`POST /images/generations`
- 图生图：
    - OpenAI / 兼容：`multipart/form-data` → `/images/edits`
    - xAI：`application/json` → `/images/edits`

## 发版与自动更新

变更记录见 [`CHANGELOG.md`](./CHANGELOG.md)。推送 `v*` tag 时，CI 会：

1. 从 `CHANGELOG.md` 截取对应版本说明写入 GitHub Release
2. 构建 Windows 安装包（NSIS / MSI），签名并上传 Updater 产物（含 `latest.json`）
3. 再构建 Android APK（arm64，正式签名，可侧载安装）并上传到**同一** Release

Release 资产通常包含：Windows NSIS / MSI（及 `.sig`）、`latest.json`、Android `.apk`。

### 仓库 Secrets

| Secret                               | 说明 |
|--------------------------------------|------|
| `TAURI_SIGNING_PRIVATE_KEY`          | **必需**（Windows Updater）：更新签名私钥全文 |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | **必需**（Windows Updater）：私钥密码 |
| `ANDROID_KEY_ALIAS`                  | **必需**（Android）：Keystore alias |
| `ANDROID_KEY_PASSWORD`               | **必需**（Android）：密钥密码 |
| `ANDROID_KEY_BASE64`                 | **必需**（Android）：`.jks` 的 base64 |

> CI 会写入 `keystore.properties` 并注入 Gradle release 签名，产出**可侧载安装的正式签名 APK**。本地 keystore 请自行备份，勿提交仓库。

本地生成密钥（勿提交私钥）：

```bash
npm run tauri signer generate -w ~/.tauri/ai-studio.key
```

### 发版步骤

1. 更新 `CHANGELOG.md`（`## [x.y.z]`）
2. 同步版本号：`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml`
3. 提交并推送后打 tag：

```bash
git tag v0.1.1
git push origin v0.1.1
```

> Updater 按版本号比较；已发布版本请勿覆盖同名 tag，应升版本再发。

## 常见问题

**`tauri:dev` 找不到 rustc / cargo**  
先安装 Rust（rustup），重开终端后再试。

**Windows 缺少 link.exe**  
安装 Visual Studio Build Tools，勾选「使用 C++ 的桌面开发」。

**浏览器 `net::ERR_FAILED` / CORS**  
开发态开启「开发代理」；或直接用 `npm run tauri:dev`（桌面端直连上游，无浏览器 CORS 限制）。

**检查更新失败 / 没有更新**  
确认已发带签名产物与 `latest.json` 的 Release，且应用版本低于最新版；仅桌面安装包支持应用内更新。
