# Changelog

本文件遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)
格式，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

发版时 GitHub Release 说明会自动截取对应版本章节（见 `.github/workflows/release.yml`）。

## [Unreleased]

## [0.1.0]

### 新增

- 多轮对话（流式输出），支持停止生成
- 文生图 / 图生图，支持数量、尺寸/比例、质量等参数
- 多提供商配置：OpenAI、xAI Grok、OpenAI 兼容中转
- 会话历史本地持久化（对话 / 生图）
- Windows Release 工作流（推送 `v*` tag 自动构建安装包）
- 桌面端自定义标题栏（无边框窗口：拖拽、最小化 / 最大化 / 关闭）
- Tauri Updater：设置页与启动时可检查更新，并支持下载安装后自动重启
- 设置页 UI 紧凑化改版

### 说明

- 应用内自动更新仅桌面客户端可用
- 发版需配置仓库 Secrets：`TAURI_SIGNING_PRIVATE_KEY`、`TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
- Release 说明由本文件对应版本章节自动生成
