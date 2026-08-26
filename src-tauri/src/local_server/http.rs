//! Axum Router 与服务启动

use axum::{
  extract::State,
  middleware,
  routing::{any, get},
  Json, Router,
};
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, RwLock};
use tokio::net::TcpListener;
use tower_http::trace::TraceLayer;

use super::auth::require_auth;
use super::proxy::proxy_handler;
use super::state::{
  generate_token, resolve_config_path, AppState, LocalServerHandle, PersistedLocalServerConfig,
  RuntimeConfig, ServerSnapshot, SharedState, WsHub, DEFAULT_BIND, DEFAULT_PORT_END,
};
use super::static_files::handle_spa;
use super::ws::ws_handler;

/// 构建路由
fn build_router(state: SharedState) -> Router {
  let api_auth = Router::new()
    .route("/api/local/info", get(local_info))
    .route("/ws", get(ws_handler))
    // 优先 /api-proxy，与前端 resolveBaseUrl 一致；/api/proxy 兼容一期路径
    .route("/api-proxy/{*path}", any(proxy_handler))
    .route("/api-proxy", any(proxy_handler))
    .route("/api/proxy/{*path}", any(proxy_handler))
    .route("/api/proxy", any(proxy_handler))
    .route_layer(middleware::from_fn_with_state(
      state.clone(),
      require_auth,
    ));

  Router::new()
    .route("/api/local/health", get(health))
    .merge(api_auth)
    .fallback(handle_spa)
    .layer(TraceLayer::new_for_http())
    .with_state(state)
}

async fn health() -> Json<serde_json::Value> {
  Json(serde_json::json!({ "ok": true }))
}

async fn local_info(State(state): State<SharedState>) -> Json<serde_json::Value> {
  let info = state
    .config
    .read()
    .expect("local server config lock")
    .to_info();
  Json(serde_json::json!({
    "port": info.port,
    "bind": info.bind,
    "token": info.token,
    "lanEnabled": info.lan_enabled,
    "proxyEnabled": info.proxy_enabled,
    "preferredPort": info.preferred_port,
    "actualPort": info.actual_port,
    "wsPath": info.ws_path,
    "proxyPath": info.proxy_path,
  }))
}

/// 在端口区间内绑定可用端口（从 preferred 起，直到 end；若 preferred > end 则仅试 preferred）
async fn bind_with_fallback(bind: &str, start: u16, end: u16) -> Result<(TcpListener, u16), String> {
  let mut last_err = String::new();
  let end = end.max(start);
  for port in start..=end {
    let addr: SocketAddr = format!("{}:{}", bind, port)
      .parse()
      .map_err(|e| format!("无效地址: {}", e))?;
    match TcpListener::bind(addr).await {
      Ok(listener) => return Ok((listener, port)),
      Err(e) => {
        last_err = format!("{}:{} -> {}", bind, port, e);
        log::warn!("[local-server] 端口 {} 占用，尝试下一个: {}", port, e);
      }
    }
  }
  Err(format!(
    "无法在 {}:{}-{} 绑定端口，最后错误: {}",
    bind, start, end, last_err
  ))
}

/// 启动本地服务，返回可供 Tauri manage 的句柄
/// `app_config_dir`：Tauri app config 目录，用于读写 local_server.json
pub async fn start_local_server(app_config_dir: Option<PathBuf>) -> Result<LocalServerHandle, String> {
  let config_path = resolve_config_path(app_config_dir);
  let persisted = PersistedLocalServerConfig::load(&config_path);

  let bind = if persisted.lan_enabled {
    "0.0.0.0".to_string()
  } else {
    DEFAULT_BIND.to_string()
  };

  let preferred = if persisted.preferred_port == 0 {
    super::state::DEFAULT_PREFERRED_PORT
  } else {
    persisted.preferred_port
  };
  // 从 preferred 起尝试到 DEFAULT_PORT_END；若自定义端口更大，至少尝试 preferred 本身
  let end = DEFAULT_PORT_END.max(preferred);

  let (listener, port) = bind_with_fallback(&bind, preferred, end).await?;

  let token = generate_token();
  let proxy_enabled = persisted.proxy_enabled;

  let config = RuntimeConfig {
    bind: bind.clone(),
    port,
    token: token.clone(),
    lan_enabled: persisted.lan_enabled,
    proxy_enabled,
    preferred_port: preferred,
    config_path: config_path.clone(),
  };

  // 首次启动确保磁盘有一份配置
  if let Err(e) = config.persist() {
    log::warn!("[local-server] 写入初始配置失败: {}", e);
  }

  let state: SharedState = Arc::new(AppState {
    config: RwLock::new(config),
    proxy_enabled_flag: AtomicBool::new(proxy_enabled),
    ws_hub: WsHub::new(),
    snapshot: RwLock::new(ServerSnapshot::default()),
  });

  let handle = LocalServerHandle {
    state: state.clone(),
  };

  let app = build_router(state);
  let url = super::state::LocalServerInfo::build_url(&bind, port, &token);

  log::info!(
    "[local-server] 已启动: {} (lan={}, proxy={}, preferred={}, config={})",
    url,
    persisted.lan_enabled,
    proxy_enabled,
    preferred,
    config_path.display()
  );
  println!("[local-server] 本机访问地址（含 token）: {}", url);

  tauri::async_runtime::spawn(async move {
    if let Err(e) = axum::serve(listener, app).await {
      log::error!("[local-server] 服务异常退出: {}", e);
    }
  });

  Ok(handle)
}
