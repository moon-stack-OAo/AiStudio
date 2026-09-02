# AGENTS.md — AI Studio

给在本仓库工作的 AI 编码助手的项目约定。详细架构见 [`docs/architecture.md`](./docs/architecture.md)；贡献与发版见 [`CONTRIBUTING.md`](./CONTRIBUTING.md)。

## 语言与沟通

- 与用户对话默认使用**简体中文**；代码标识符、库名、API 名保持英文。
- 代码注释优先中文；解释概念时可附英文原文。
- 回复简洁：先结论，再必要说明；不确定需求时先澄清，勿自行假设。
- 未经用户明确要求，不要主动写 README / 架构文档等说明文件。

## 项目定位

本地多模态 AI 客户端（无自建后端密钥托管）：

- 对话（SSE 流式）· 文生图 / 图生图 · 文生视频 / 图生视频
- 提供商：OpenAI · xAI · OpenAI 兼容中转
- 目标：浏览器开发 + Tauri 2（Windows 桌面 + Android arm64 侧载 APK）

技术栈：Vue 3 · Vite · Naive UI · Pinia · Vue Router · Tauri 2 · Vitest · ESLint · Prettier

## 目录分层（必须遵守）

```
src/core/      # 双端共享：API、stores、providers、composables、工具、共享 UI / 样式 base
src/desktop/   # Windows / 浏览器壳：路由入口、视图布局、标题栏、托盘相关 UI
src/android/   # Android 壳：底栏 Tab、返回键分层、移动布局
src-tauri/     # Rust、Tauri 配置、持久 Android 原生源（android/）与 gen/
```

别名：`@core` → `src/core`；`@` → 当前端的 `src/desktop` 或 `src/android`。

### 应放进 `src/core`

- 上游协议、请求组装、错误文案与超时常量
- Pinia stores 与持久化键
- `appFetch` / 代理头 / 密钥混淆 / 版本号
- 与壳无关的 composables（如 `useChatSession` / `useImageSession` / `useVideoSession`）
- Provider profiles 与 image/video adapters
- 同构样式：`styles/*-base.scss`、`tokens.scss`

### 必须分叉在 desktop / android

- `createRouter` + 本端 views、侧栏 vs 底栏布局
- 标题栏 / 托盘 / 关闭行为 vs 返回键分层 / 安全区 / 软键盘
- 更新安装路径（桌面 Updater vs Android 侧载）
- Vite / HTML 入口与 `outDir`

两端大段相同的 views/components → 抽到 core 或共享子组件；**不要**把托盘或底栏逻辑塞进 core。

## 常用命令

| 场景     | 命令                                                                             |
| -------- | -------------------------------------------------------------------------------- |
| 装依赖   | `npm ci`（不改依赖时）；改依赖才用 `npm i <pkg>`                                 |
| 开发     | `npm run dev` / `npm run tauri:dev`                                              |
| 校验     | `npm run format:check` · `npm run lint` · `npm run test` · `npm run check:theme` |
| 修复     | `npm run format` · `npm run lint:fix`                                            |
| 构建     | `npm run build:desktop` · `npm run build:android`                                |
| 桌面打包 | `npm run tauri:build:win` · `npm run tauri:build:check`                          |

改完相关代码后，至少跑通：`lint` + `test`；动到主题色再跑 `check:theme`；动到构建路径再跑对应 `build:*`。

Node：**18+**，推荐 / CI：**24**（`.nvmrc`）。不要无故提交仅 `dev`/`devOptional` 元数据噪音的 `package-lock.json` 变更。

## 代码风格

- JS / Vue：ESLint flat config + Prettier；提交前格式须过 `format:check`。
- 未使用变量可用 `_` 前缀；不要为过 lint 做无意义大改。
- **不要**主动添加注释，除非用户要求或逻辑非注释难以理解。
- 样式：**结构一份、密度两套**。同构规则进 `*-base.scss`；间距/圆角/字号用 CSS 变量，由端侧覆写。改主题色须同步 `theme.js` 的 `PALETTE`，并跑 `npm run check:theme`。
- 网络一律走 `src/core/utils/http.js` 的 `appFetch`；勿绕过 `assertSafeFetchUrl`。
- API Key 经 `secret.js` 混淆后写入 `localStorage`（非强加密）；勿把密钥写进日志或仓库。

## Provider 扩展

1. 协议已兼容 → 用户加「自定义兼容」即可，不必改代码。
2. 需新协议：`profiles/` → `resolveProfile.js` / `capabilities.js` → 必要时 `adapters/image|video/` → 可选 `settings.js` 的 `PRESETS`。
3. Adapters **只**负责协议与请求组装，不要塞入端侧 UI 差异。
4. Agnes 等网关按 URL/模型自动识别，不作为用户可选接口类型。

## 原生 / Android

- 持久 Kotlin / 资源只改 `src-tauri/android/`，**不要**只改 `gen/android`。
- `tauri android init` 之后必须：`node .github/scripts/sync-android-updater-sources.mjs`。
- 签名私钥、keystore、密码 **永不**进仓库。

## 版本号同步（发版时）

以下必须与 `CHANGELOG.md` 一致后再打 `v*` tag：

1. `package.json` → `version`
2. `src-tauri/tauri.conf.json` → `version`
3. `src-tauri/Cargo.toml` → `[package] version`
4. `src/core/utils/version.js` → `APP_VERSION`

**未明确要求打 TAG / 发版前，不要随意改版本号。** 已发布版本勿覆盖同名 tag。

## Git 约束

未经用户明确授权，**禁止**执行：

- `git add` / `git commit` / `git push`
- `git reset` / `git rebase` / `git checkout --`
- 删除分支或覆盖历史

涉及 Git 操作时先说明影响并征求确认。提交信息使用中文。未 TAG 前的多次修改视为同一版本变动。

## 安全红线

- 勿提交或打印：API Key、Tauri 签名私钥、Android keystore / 密码、`.env` 机密。
- 勿削弱 `assertSafeFetchUrl` / 代理侧危险主机拦截。
- 安全模型见 [`SECURITY.md`](./SECURITY.md)。

## 测试约定

- 单元测试：Vitest；用例多在 `src/core/**/__tests__/*.spec.js`。
- 新增 core 逻辑（http、adapters、composables、prompts）时优先补对应单测。
- 不要假设未声明的测试框架或脚本。

## 工作优先级（给 Agent）

1. 先读相关目录与现有模式，再改代码；共享逻辑优先落 `core`。
2. 保持端侧差异最小化；抽共享时不要抹平 Desktop 偏松 / Android 偏紧的密度差异。
3. 改完跑 lint / test（及必要的 theme / build）；不要擅自 commit / push / 改版本号。
4. 需求歧义或有生产风险时，先指出并确认，再动手。
