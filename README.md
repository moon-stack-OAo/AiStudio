# AI Studio

本地 AI 客户端：多轮对话、文生图、图生图。支持 OpenAI / xAI Grok / 任意 OpenAI 兼容接口。

可在浏览器中以 Web 方式开发，也可通过 Tauri 2 打包为桌面应用（自定义标题栏、本机远程访问、应用内自动更新）。

## 功能概览

- **对话**：流式输出、停止生成、会话历史本地保存
- **生图**：文生图 / 图生图，数量、尺寸或比例、质量等参数
- **润色**：聊天与生图输入框均可一键润色（风格、替换、撤销）
- **多提供商**：OpenAI、xAI、OpenAI 兼容中转；密钥仅存本机
- **桌面端**：无边框自定义标题栏；本机 HTTP/WS 远程访问与 API 代理
- **自动更新**：Tauri Updater（检查 → 下载安装 → 重启）

## 技术栈

- Vue 3 + Vite + Naive UI
- Pinia + Vue Router
- `localStorage` / IndexedDB 持久化
- Tauri 2（可选桌面打包）

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
npm run tauri:dev    # Vite + 原生窗口
npm run tauri:build  # 安装包输出在 src-tauri/target/release/bundle
```

- `tauri:dev` 会先跑 `npm run dev`，再加载 `http://localhost:5173`
- `tauri:build` 会先跑 `npm run build`，再打包 `dist`
- 纯 Web 开发仍可用 `npm run dev` / `npm run build`

### 配置摘要

- 应用名：`AI Studio` · Bundle ID：`com.moon.aistudio`
- 默认窗口：1280×800（最小 960×640），无系统边框（自定义标题栏）
- Updater 端点：GitHub Releases `latest.json`
- CSP 已放行 `https:` / `http:` 的 `connect-src`

## 使用说明

1. 「设置」填写 Base URL、API Key、对话/生图模型
2. 「对话」或「生图」中切换提供商后使用
3. 桌面端可在「设置 → 本地远程访问」复制带 token 的 URL，用浏览器打开同一套 UI
4. 「设置 → 关于与更新」可检查并安装更新（仅桌面端）

### 预设示例

| 提供商      | Base URL                    | 对话模型示例   | 生图模型示例                     |
|----------|-----------------------------|----------|----------------------------|
| OpenAI   | `https://api.openai.com/v1` | `gpt-4o` | `gpt-image-1` / `dall-e-3` |
| xAI Grok | `https://api.x.ai/v1`       | `grok-4` | `grok-imagine-image`       |
| 兼容中转     | 你的中转地址 `/v1`                | 按中转文档    | 按中转文档                      |

## 接口约定

- 对话：`POST /chat/completions`（流式 SSE）
- 文生图：`POST /images/generations`
- 图生图：
    - OpenAI / 兼容：`multipart/form-data` → `/images/edits`
    - xAI：`application/json` → `/images/edits`

## 发版与自动更新

变更记录见 [`CHANGELOG.md`](./CHANGELOG.md)。推送 `v*` tag 时，CI 会：

1. 从 `CHANGELOG.md` 截取对应版本说明写入 GitHub Release
2. 构建 Windows 安装包（NSIS / MSI）
3. 签名并上传 Updater 产物（含 `latest.json`）

### 仓库 Secrets（必需）

| Secret                               | 说明       |
|--------------------------------------|----------|
| `TAURI_SIGNING_PRIVATE_KEY`          | 更新签名私钥全文 |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | 私钥密码     |

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
开发态开启「开发代理」；或经桌面端本地服务打开并启用 API 代理；或直接用 `npm run tauri:dev`。

**检查更新失败 / 没有更新**  
确认已发带签名产物与 `latest.json` 的 Release，且应用版本低于最新版；仅桌面安装包支持应用内更新。
