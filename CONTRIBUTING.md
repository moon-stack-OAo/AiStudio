# 贡献指南

感谢参与 AI Studio。本文说明开发环境、常用命令、PR 约定与发版前检查项。架构细节见 [`docs/architecture.md`](./docs/architecture.md)。

## 开发环境

| 依赖            | 说明                                                                                      |
| --------------- | ----------------------------------------------------------------------------------------- |
| Node.js         | **18+**（`package.json` `engines`）；**CI 使用 24**                                       |
| npm             | 与 Node 配套即可                                                                          |
| Rust            | [rustup](https://rustup.rs/)，桌面 / Android 原生构建需要                                 |
| Windows 桌面    | WebView2；MSVC「使用 C++ 的桌面开发」                                                     |
| Android（可选） | JDK 17+、Android SDK / NDK 等；详见 [README · Android](./README.md#androidtauri-2-mobile) |

```bash
node -v && npm -v && rustc --version && cargo --version
npm install
```

## 常用命令

| 命令                                                        | 说明                                                            |
| ----------------------------------------------------------- | --------------------------------------------------------------- |
| `npm run dev`                                               | 浏览器开发（桌面 Vite 配置，默认端口 5173）                     |
| `npm run build` / `build:desktop` / `build:android`         | 前端生产构建                                                    |
| `npm run lint` / `lint:fix`                                 | ESLint                                                          |
| `npm run test` / `test:watch`                               | Vitest                                                          |
| `npm run check:theme`                                       | 主题相关同步检查（CI 会跑）                                     |
| `npm run format` / `format:check`                           | Prettier；**CI 中 `format:check` 尚未全开**（见 `ci.yml` 注释） |
| `npm run tauri:dev`                                         | Vite + Tauri 桌面窗口                                           |
| `npm run tauri:build` / `tauri:build:win`                   | 桌面打包；Windows 可用 NSIS+MSI                                 |
| `npm run tauri:build:check`                                 | 检查安装包 / 签名产物                                           |
| `npm run tauri:android:init`                                | 初始化 Android 工程                                             |
| `npm run tauri:build:android` / `tauri:build:android:debug` | Android APK                                                     |

更多环境与签名说明见 [README](./README.md)。

## 分支与 Pull Request

- 日常校验靠 [`.github/workflows/ci.yml`](./.github/workflows/ci.yml)（主题检查、lint、test、双端 Vite build、`cargo check`）。
- **不要**只依赖 [`.github/workflows/release.yml`](./.github/workflows/release.yml)（仅 `v*` tag 发版）来发现常规问题。
- PR 合并前请本地至少：`npm run lint`、`npm run test`、`npm run check:theme`；改动前端构建路径时再跑对应 `build:*`。
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
- **Prettier**：`npm run format` 可写回；`format:check` 已配置，但现有代码风格尚未全量统一， **CI 暂未强制** `format:check`。新代码请尽量符合 Prettier / 邻近文件风格。
- 共享逻辑优先放 `src/core`；端差异放 `src/desktop` 或 `src/android`。原则见 [架构文档 · 维护原则](./docs/architecture.md#9-维护原则哪些必须分叉哪些应进-core)。

## 安全

- **勿提交**：API Key、Tauri 签名私钥、Android keystore / 密码、`.env` 中的机密。
- 本地 keystore、`~/.tauri/*.key` 等仅放本机或 GitHub Secrets。
- 安全模型与披露方式见 [`SECURITY.md`](./SECURITY.md)。

## 许可

本项目采用 [MIT License](./LICENSE)。贡献即表示同意以相同许可收录你的改动。
