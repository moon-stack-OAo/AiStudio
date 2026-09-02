# Security Policy / 安全策略

## 支持的版本

| 版本  | 支持状态       |
| ----- | -------------- |
| 1.0.x | 当前维护       |
| < 1.0 | 不提供安全修复 |

请尽量使用最新的 `1.0.x` 发布版本。

## 如何报告漏洞

仓库：[`moon-stack-OAo/AiStudio`](https://github.com/moon-stack-OAo/AiStudio)

**推荐**：使用 GitHub 的 [Report a vulnerability](https://github.com/moon-stack-OAo/AiStudio/security/advisories/new)（Security Advisories），以便私下沟通。

若 Advisories 不可用，可开 Issue 并标注安全相关，但请：

- **不要**在公开 Issue、讨论或 PR 中粘贴 API Key、签名私钥、keystore 密码或其他敏感信息
- 尽量说明影响范围、复现步骤与所在版本

收到报告后会评估并尽力响应；不承诺固定 SLA。

## 已知安全模型说明

本项目是 **本机运行**的 AI 客户端，安全边界与常见云 SaaS 不同，请知悉：

### API Key 存储

- 密钥仅保存在本机（`localStorage`），不会上传到本项目服务端（本项目无后端密钥托管）。
- 落盘前使用 XOR 混淆，目的是避免「明文一眼可见」， **不是**强加密， **不能**抵御本机恶意软件、有权访问本机存储的攻击者或物理拿到设备后的读取。
- 请勿在不受信任的设备上保存密钥；清数据或卸载前请自行备份需要的配置。

### 自定义 Base URL / 中转站

- 支持自定义 OpenAI 兼容接口是产品能力。
- 运行时 `assertSafeFetchUrl` 与开发代理共用同一套黑名单：拦截云元数据（含 `169.254.*`、IPv6 IMDS）、`0.0.0.0` / `::` / `::1`、kubernetes 默认主机等；**不**硬拦 localhost / RFC1918（本地与内网中转仍可用），设置页会对明文 HTTP / 非公网地址给出风险提示。
- **打包态（Tauri）**：`capabilities` 中 `http:default` 在宽 `allow`（`http(s)://**`）之上追加同目标 `deny` URL Pattern（deny 优先于 allow）。校验只针对 **初始请求 URL**；`plugin-http` **不会**对 redirect 目标复验 scope，该盲区仍依赖前端 `assertSafeFetchUrl`（及 Android 媒体下载等自建路径上的二次校验）。私网与 localhost 仍放行。
- 这 **不能**替代对中转站本身的信任判断；请自行核实隐私与合规；密钥会发往你配置的上游。

### 发版与签名材料

- Windows Updater 签名私钥、Android keystore 及密码等 **不得**提交进仓库。
- 发版相关密钥应只放在 GitHub Secrets 或本机安全位置；详见 README「仓库 Secrets」。

## 安全更新预期

- 对有效漏洞报告：评估影响后，会在合理范围内修复并随后续版本发布。
- 响应以「尽力而为」为原则；严重问题会优先处理。
- 修复说明可参考 [`CHANGELOG.md`](./CHANGELOG.md) 与对应 GitHub Release。
