//! AI Studio 桌面端入口：托盘与 Tauri commands

mod tray;

use tauri::{Manager, WindowEvent};
use tray::{
    confirm_close_action, get_close_action_pref, handle_close_requested, set_close_action_pref,
    setup_tray, WindowPrefsState,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
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
            app.manage(WindowPrefsState::load(app_config_dir));

            setup_tray(app.handle())?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    handle_close_requested(window.app_handle(), api);
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            confirm_close_action,
            get_close_action_pref,
            set_close_action_pref
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
