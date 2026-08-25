# AI Studio

本地 AI 客户端：多轮对话、文生图、图生图。支持 OpenAI / xAI Grok / 任意 OpenAI 兼容接口。

可在浏览器中以 Web 方式开发，也可通过 Tauri 2 打包为桌面应用。

## 技术栈

- Vue 3 + Vite
- Naive UI
- Pinia + Vue Router
- 本地 `localStorage` / IndexedDB 保存密钥、历史与生图缓存
- Tauri 2（可选桌面打包）

## 快速开始（Web）

```bash
npm install
npm run dev
```

浏览器打开终端提示的地址（默认 `http://localhost:5173`）。

仅构建前端：

```bash
npm run build
npm run preview
```

## 桌面端（Tauri 2）

### 环境要求

| 依赖               | 说明                                                                                                 |
|------------------|----------------------------------------------------------------------------------------------------|
| Node.js          | 建议 18+（本项目已用 npm）                                                                                  |
| Rust             | 安装 [rustup](https://rustup.rs/)，确保 `rustc`、`cargo` 可用                                              |
| Windows WebView2 | Win10/11 通常已预装；若缺失请安装 [WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/) |
| MSVC 构建工具        | Windows 上 Rust 默认需要 Visual Studio Build Tools（含「使用 C++ 的桌面开发」）                                     |

验证：

```bash
node -v
npm -v
rustc --version
cargo --version
```

### 开发 / 打包

```bash
# 安装依赖（含 @tauri-apps/cli）
npm install

# 开发模式：启动 Vite + 打开原生窗口
npm run tauri:dev

# 生产构建：产出安装包 / 可执行文件（输出在 src-tauri/target/release/bundle）
npm run tauri:build
```

说明：

- `npm run tauri:dev` 会先执行 `npm run dev`，再启动桌面窗口加载 `http://localhost:5173`
- `npm run tauri:build` 会先执行 `npm run build`，再打包 `dist`
- 原有 `npm run dev` / `npm run build` **不受影响**，可继续纯 Web 开发

### 配置摘要

- 应用名：`AI Studio`
- Bundle ID：`com.moon.aistudio`
- 默认窗口：1280×800（最小 960×640）
- CSP 已放行 `https:` / `http:` 的 `connect-src`，以便对话与生图请求用户配置的任意 Base URL

## 使用说明

1. 进入「设置」，填写 Base URL 与 API Key
2. 配置对话模型 / 生图模型
3. 在「对话」或「生图」页切换提供商后使用

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

## 常见问题

**`tauri:dev` 报找不到 rustc / cargo**  
先安装 Rust（rustup），重新打开终端后再试。

**Windows 链接错误 / 缺少 link.exe**  
安装 Visual Studio Build Tools，勾选「使用 C++ 的桌面开发」。

**窗口白屏或无法请求 API**  
确认设置里的 Base URL 可访问；CSP 已允许 http/https，若仍被拦请检查目标服务 CORS（桌面 WebView 对跨域通常比浏览器宽松，但仍取决于运行时）。
