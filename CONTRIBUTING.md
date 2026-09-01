# 贡献指南

感谢参与 AI Studio。本文说明开发环境、常用命令、PR 约定与发版前检查项。架构细节见 [`docs/architecture.md`](./docs/architecture.md)。

## 开发环境

| 依赖            | 说明                                                                                      |
| --------------- | ----------------------------------------------------------------------------------------- |
| Node.js         | **18+**（`package.json` `engines`）；**推荐 / CI：24**（见 `.nvmrc`）                     |
| npm             | 与 Node 配套；仓库以 `packageManager` 声明的 npm 为准（当前 `10.9.3`）                    |
| Rust            | [rustup](https://rustup.rs/)，桌面 / Android 原生构建需要                                 |
| Windows 桌面    | WebView2；MSVC「使用 C++ 的桌面开发」                                                     |
| Android（可选） | JDK 17+、Android SDK / NDK 等；详见 [README · Android](./README.md#androidtauri-2-mobile) |

```bash
node -v && npm -v && rustc --version && cargo --version
# 日常装依赖优先 npm ci（严格按 lockfile，不改写元数据）
npm ci
# 只有要新增/升级依赖时才用 npm install / npm i <pkg>
```

### `package-lock.json` 为何会「无故」变脏

常见原因：本地 `npm install` 的 **npm 大版本** 与生成/更新 lockfile 时不一致（例如本机 Node 22 自带 npm 10，CI 用 Node 24 / Dependabot 用另一套），会把可选依赖标记从 `devOptional` 改成 `dev`（或反过来）。**版本号与 integrity 未变时，这只是元数据噪音，不要提交。**

处理：

```bash
# 看 diff：若只有 "dev": true / "devOptional": true 之类，直接还原
git restore package-lock.json
```

约定：

1. 不改依赖 → 用 `npm ci`，不要随手 `npm install`
2. 改依赖 → `npm i <pkg>` 后检查 lockfile，确认是预期的版本变更再提交
3. 尽量用与 CI 相同的 Node 24（`nvm use` / `fnm use` 会读 `.nvmrc`）

## 常用命令

| 命令                                                        | 说明                                                 |
| ----------------------------------------------------------- | ---------------------------------------------------- |
| `npm run dev`                                               | 浏览器开发（桌面 Vite 配置，默认端口 5173）          |
| `npm run build` / `build:desktop` / `build:android`         | 前端生产构建                                         |
| `npm run lint` / `lint:fix`                                 | ESLint                                               |
| `npm run test` / `test:watch`                               | Vitest                                               |
| `npm run check:theme`                                       | 主题相关同步检查（CI 会跑）                          |
| `npm run format` / `format:check`                           | Prettier；**提交前建议跑 `format:check`，CI 已强制** |
| `npm run tauri:dev`                                         | Vite + Tauri 桌面窗口                                |
| `npm run tauri:build` / `tauri:build:win`                   | 桌面打包；Windows 可用 NSIS+MSI                      |
| `npm run tauri:build:check`                                 | 检查安装包 / 签名产物                                |
| `npm run tauri:android:init`                                | 初始化 Android 工程                                  |
| `npm run tauri:build:android` / `tauri:build:android:debug` | Android APK                                          |

更多环境与签名说明见 [README](./README.md)。

## 分支与 Pull Request

- 日常校验靠 [`.github/workflows/ci.yml`](./.github/workflows/ci.yml)（主题检查、lint、test、双端 Vite build、`cargo check`）。
- **不要**只依赖 [`.github/workflows/release.yml`](./.github/workflows/release.yml)（仅 `v*` tag 发版）来发现常规问题。
- PR 合并前请本地至少：`npm run format:check`、`npm run lint`、`npm run test`、`npm run check:theme`；改动前端构建路径时再跑对应 `build:*`。
- 推送到 `main` / `master` / `dev` 或打开 PR 会触发 CI。

## 版本号四处同步清单

发版或升版本时，以下四处与 Changelog **必须一致**（当前示例为 `1.0.0`）：

1. [`package.json`](./package.json) → `"version"`
2. [`src-tauri/tauri.conf.json`](./src-tauri/tauri.conf.json) → `"version"`
3. [`src-tauri/Cargo.toml`](./src-tauri/Cargo.toml) → `[package] version`
4. [`src/core/utils/version.js`](./src/core/utils/version.js) → `APP_VERSION`

并同时更新：

5. [`CHANGELOG.md`](./CHANGELOG.md) → 增加 `## [x.y.z]` 章节（Release 正文由此截取）

然后打 tag 并推送，例如：

```bash
git tag v1.0.0
git push origin v1.0.0
```

> Updater 按版本号比较；已发布版本请勿覆盖同名 tag，应升版本再发。

## Android 注意

```bash
npm run tauri:android:init
node .github/scripts/sync-android-updater-sources.mjs   # init 后必跑
```

`gen/android` 会被 init 覆盖；持久源在 `src-tauri/android/`。不同步会导致安全区 Bridge、侧载更新、相册保存等能力丢失。

## 代码风格

- **ESLint**：`npm run lint`（CI 启用）。
- **Prettier**：`npm run format` 可写回；`npm run format:check` **CI 已强制**。提交前请先过格式检查。
- 共享逻辑优先放 `src/core`；端差异放 `src/desktop` 或 `src/android`。原则见 [架构文档 · 维护原则](./docs/architecture.md#9-维护原则哪些必须分叉哪些应进-core)。

## 安全

- **勿提交**：API Key、Tauri 签名私钥、Android keystore / 密码、`.env` 中的机密。
- 本地 keystore、`~/.tauri/*.key` 等仅放本机或 GitHub Secrets。
- 安全模型与披露方式见 [`SECURITY.md`](./SECURITY.md)。

## 许可

本项目采用 [MIT License](./LICENSE)。贡献即表示同意以相同许可收录你的改动。
