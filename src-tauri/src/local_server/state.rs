//! 本地服务共享状态（含二期 WS 快照与广播中枢、三期代理/局域网配置）

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, RwLock};
use tokio::sync::{mpsc, Mutex as AsyncMutex};

/// Cookie 名称：浏览器首次用 query token 后写入，后续请求自动带上
pub const TOKEN_COOKIE: &str = "ai_studio_token";

/// 默认绑定地址与起始端口；占用则递增至上限
pub const DEFAULT_BIND: &str = "127.0.0.1";
pub const DEFAULT_PORT_END: u16 = 17900;
pub const DEFAULT_PREFERRED_PORT: u16 = 17890;

/// 持久化配置文件名（位于 app config dir）
pub const CONFIG_FILE_NAME: &str = "local_server.json";

/// WS 单帧上限（字节）
pub const WS_MAX_MESSAGE_SIZE: usize = 8 * 1024 * 1024;

/// 磁盘上的可持久化配置
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistedLocalServerConfig {
  #[serde(default = "default_preferred_port")]
  pub preferred_port: u16,
  #[serde(default)]
  pub lan_enabled: bool,
  #[serde(default = "default_true")]
  pub proxy_enabled: bool,
}

fn default_preferred_port() -> u16 {
  DEFAULT_PREFERRED_PORT
}

fn default_true() -> bool {
  true
}

impl Default for PersistedLocalServerConfig {
  fn default() -> Self {
    Self {
      preferred_port: DEFAULT_PREFERRED_PORT,
      lan_enabled: false,
      proxy_enabled: true,
    }
  }
}

impl PersistedLocalServerConfig {
  pub fn load(path: &Path) -> Self {
    match fs::read_to_string(path) {
      Ok(text) => serde_json::from_str(&text).unwrap_or_default(),
      Err(_) => Self::default(),
    }
  }

  pub fn save(&self, path: &Path) -> Result<(), String> {
    if let Some(parent) = path.parent() {
      fs::create_dir_all(parent).map_err(|e| format!("创建配置目录失败: {}", e))?;
    }
    let text =
      serde_json::to_string_pretty(self).map_err(|e| format!("序列化配置失败: {}", e))?;
    fs::write(path, text).map_err(|e| format!("写入配置失败: {}", e))
  }
}

/// 对外暴露的服务信息（前端 / Tauri command / /api/local/info）
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalServerInfo {
  /// 实际监听端口
  pub port: u16,
  pub bind: String,
  pub token: String,
  pub url: String,
  pub lan_enabled: bool,
  pub proxy_enabled: bool,
  pub preferred_port: u16,
  /// 与 port 相同，便于前端语义区分「偏好 / 实际」
  pub actual_port: u16,
  pub ws_path: String,
  pub proxy_path: String,
}

impl LocalServerInfo {
  pub fn build_url(bind: &str, port: u16, token: &str) -> String {
    // 局域网绑 0.0.0.0 时，对外展示仍用本机可达地址提示；URL host 用 127.0.0.1 便于本机浏览器打开
    let host = if bind == "0.0.0.0" { "127.0.0.1" } else { bind };
    format!("http://{}:{}/?t={}", host, port, token)
  }

  pub fn from_runtime(cfg: &RuntimeConfig) -> Self {
    Self {
      port: cfg.port,
      bind: cfg.bind.clone(),
      token: cfg.token.clone(),
      url: Self::build_url(&cfg.bind, cfg.port, &cfg.token),
      lan_enabled: cfg.lan_enabled,
      proxy_enabled: cfg.proxy_enabled,
      preferred_port: cfg.preferred_port,
      actual_port: cfg.port,
      ws_path: "/ws".to_string(),
      proxy_path: "/api-proxy".to_string(),
    }
  }
}

/// set_local_server_config 的返回
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SetLocalServerConfigResult {
  #[serde(flatten)]
  pub info: LocalServerInfo,
  pub need_restart: bool,
}

/// 运行时可变配置
#[derive(Debug, Clone)]
pub struct RuntimeConfig {
  pub bind: String,
  /// 实际监听端口
  pub port: u16,
  pub token: String,
  pub lan_enabled: bool,
  pub proxy_enabled: bool,
  pub preferred_port: u16,
  /// 配置文件路径（用于 persist）
  pub config_path: PathBuf,
}

impl RuntimeConfig {
  pub fn to_info(&self) -> LocalServerInfo {
    LocalServerInfo::from_runtime(self)
  }

  pub fn to_persisted(&self) -> PersistedLocalServerConfig {
    PersistedLocalServerConfig {
      preferred_port: self.preferred_port,
      lan_enabled: self.lan_enabled,
      proxy_enabled: self.proxy_enabled,
    }
  }

  pub fn persist(&self) -> Result<(), String> {
    self.to_persisted().save(&self.config_path)
  }
}

/// 服务端会话快照（settings / chat / image）
#[derive(Debug, Clone, Default)]
pub struct ServerSnapshot {
  pub rev: u64,
  pub settings: Option<Value>,
  pub chat: Option<Value>,
  pub image: Option<Value>,
}

impl ServerSnapshot {
  /// 是否已有任一 store 的数据
  pub fn has_state(&self) -> bool {
    self.settings.is_some() || self.chat.is_some() || self.image.is_some()
  }

  /// 组装完整 state 对象（缺省字段为 null）
  pub fn to_state_value(&self) -> Value {
    serde_json::json!({
      "settings": self.settings,
      "chat": self.chat,
      "image": self.image,
    })
  }

  /// 用 full_state 覆盖并递增 rev
  pub fn apply_full(&mut self, state: &Value) {
    if let Some(v) = state.get("settings") {
      if !v.is_null() {
        self.settings = Some(v.clone());
      }
    }
    if let Some(v) = state.get("chat") {
      if !v.is_null() {
        self.chat = Some(v.clone());
      }
    }
    if let Some(v) = state.get("image") {
      if !v.is_null() {
        self.image = Some(v.clone());
      }
    }
    self.rev = self.rev.saturating_add(1);
  }

  /// 用单个 store 的完整对象覆盖并递增 rev
  pub fn apply_patch(&mut self, store: &str, data: Value) -> Result<(), String> {
    match store {
      "settings" => self.settings = Some(data),
      "chat" => self.chat = Some(data),
      "image" => self.image = Some(data),
      other => return Err(format!("未知 store: {}", other)),
    }
    self.rev = self.rev.saturating_add(1);
    Ok(())
  }
}

/// 单条出站文本帧发送端
pub type WsOutbound = mpsc::UnboundedSender<String>;

#[derive(Debug)]
struct WsHubInner {
  next_id: u64,
  /// conn_id → 出站通道
  clients: HashMap<u64, WsOutbound>,
}

/// WS 连接广播中枢：手动管理 Tx 列表，断开时清理
#[derive(Debug)]
pub struct WsHub {
  inner: AsyncMutex<WsHubInner>,
}

impl Default for WsHub {
  fn default() -> Self {
    Self::new()
  }
}

impl WsHub {
  pub fn new() -> Self {
    Self {
      inner: AsyncMutex::new(WsHubInner {
        next_id: 1,
        clients: HashMap::new(),
      }),
    }
  }

  /// 注册连接，返回 conn_id
  pub async fn register(&self, tx: WsOutbound) -> u64 {
    let mut guard = self.inner.lock().await;
    let id = guard.next_id;
    guard.next_id = guard.next_id.saturating_add(1);
    guard.clients.insert(id, tx);
    log::info!("[local-server] ws 注册连接 conn_id={} 当前数={}", id, guard.clients.len());
    id
  }

  /// 断开时移除
  pub async fn unregister(&self, conn_id: u64) {
    let mut guard = self.inner.lock().await;
    guard.clients.remove(&conn_id);
    log::info!(
      "[local-server] ws 注销连接 conn_id={} 剩余={}",
      conn_id,
      guard.clients.len()
    );
  }

  /// 向除 except_conn 外的所有连接广播文本帧
  pub async fn broadcast_text(&self, text: &str, except_conn: Option<u64>) {
    let guard = self.inner.lock().await;
    let mut dead = Vec::new();
    for (id, tx) in guard.clients.iter() {
      if except_conn == Some(*id) {
        continue;
      }
      if tx.send(text.to_string()).is_err() {
        dead.push(*id);
      }
    }
    drop(guard);
    if !dead.is_empty() {
      let mut guard = self.inner.lock().await;
      for id in dead {
        guard.clients.remove(&id);
      }
    }
  }
}

/// 应用级共享状态
#[derive(Debug)]
pub struct AppState {
  pub config: RwLock<RuntimeConfig>,
  /// 代理开关热更新（与 config.proxy_enabled 同步）
  pub proxy_enabled_flag: AtomicBool,
  pub ws_hub: WsHub,
  pub snapshot: RwLock<ServerSnapshot>,
}

pub type SharedState = Arc<AppState>;

impl AppState {
  pub fn proxy_enabled(&self) -> bool {
    self.proxy_enabled_flag.load(Ordering::Relaxed)
  }
}

/// 供 Tauri command 使用的句柄（与 axum 共用同一份 SharedState）
#[derive(Clone)]
pub struct LocalServerHandle {
  pub state: SharedState,
}

impl LocalServerHandle {
  pub fn info(&self) -> LocalServerInfo {
    self
      .state
      .config
      .read()
      .expect("local server config lock")
      .to_info()
  }

  /// 重新生成 token，返回最新信息
  pub fn regenerate_token(&self) -> LocalServerInfo {
    let mut cfg = self.state.config.write().expect("local server config lock");
    cfg.token = generate_token();
    // token 不持久化到文件（每次启动可新生成；用户主动 regenerate 仅内存）
    cfg.to_info()
  }

  /// 更新可持久化配置；端口/局域网变更需重启
  pub fn set_config(
    &self,
    port: Option<u16>,
    lan_enabled: Option<bool>,
    proxy_enabled: Option<bool>,
  ) -> Result<SetLocalServerConfigResult, String> {
    let mut cfg = self.state.config.write().expect("local server config lock");
    let mut need_restart = false;

    if let Some(p) = port {
      if p == 0 {
        return Err("端口无效".into());
      }
      if p != cfg.preferred_port {
        cfg.preferred_port = p;
        need_restart = true;
      }
    }

    if let Some(lan) = lan_enabled {
      if lan != cfg.lan_enabled {
        cfg.lan_enabled = lan;
        need_restart = true;
      }
    }

    if let Some(proxy) = proxy_enabled {
      cfg.proxy_enabled = proxy;
      self
        .state
        .proxy_enabled_flag
        .store(proxy, Ordering::Relaxed);
    }

    cfg.persist()?;
    Ok(SetLocalServerConfigResult {
      info: cfg.to_info(),
      need_restart,
    })
  }
}

/// 生成至少 24 字节的随机 token（hex，48 字符）
pub fn generate_token() -> String {
  use rand::RngCore;
  let mut bytes = [0u8; 24];
  rand::thread_rng().fill_bytes(&mut bytes);
  hex::encode(bytes)
}

/// 解析配置目录：优先 Tauri app config，否则回退到临时/本地路径
pub fn resolve_config_path(app_config_dir: Option<PathBuf>) -> PathBuf {
  let dir = app_config_dir.unwrap_or_else(|| {
    std::env::temp_dir().join("ai-studio-local-server")
  });
  dir.join(CONFIG_FILE_NAME)
}
