//! AI Studio 桌面端入口：启动本机 HTTP 服务并注册 Tauri commands

mod local_server;

use local_server::{LocalServerHandle, LocalServerInfo, SetLocalServerConfigResult};
use tauri::Manager;

/// 获取本地服务信息（含带 token 的访问 URL）
#[tauri::command]
fn get_local_server_info(handle: tauri::State<'_, LocalServerHandle>) -> LocalServerInfo {
  handle.info()
}

/// 重新生成访问 token
#[tauri::command]
fn regenerate_local_token(handle: tauri::State<'_, LocalServerHandle>) -> LocalServerInfo {
  handle.regenerate_token()
}

/// 更新本地服务配置（端口 / 局域网 / API 代理）；端口与局域网需重启生效
#[tauri::command]
fn set_local_server_config(
  handle: tauri::State<'_, LocalServerHandle>,
  port: Option<u16>,
  lan_enabled: Option<bool>,
  proxy_enabled: Option<bool>,
) -> Result<SetLocalServerConfigResult, String> {
  handle.set_config(port, lan_enabled, proxy_enabled)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_process::init())
    .plugin(tauri_plugin_updater::Builder::new().build())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      let app_config_dir = app.path().app_config_dir().ok();

      // 绑定端口并启动 axum（serve 在内部 spawn）
      let handle =
        tauri::async_runtime::block_on(local_server::start_local_server(app_config_dir))
          .map_err(|e| -> Box<dyn std::error::Error> { e.into() })?;
      let info = handle.info();
      log::info!(
        "[local-server] port={} token 已就绪，URL={}",
        info.port,
        info.url
      );
      app.manage(handle);

      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      get_local_server_info,
      regenerate_local_token,
      set_local_server_config
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
