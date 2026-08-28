//! AI Studio 入口：桌面端含托盘与关闭行为；移动端仅保留 HTTP 等通用能力

#[cfg(desktop)]
mod tray;

#[cfg(target_os = "android")]
mod android_updater;

#[cfg(target_os = "android")]
mod android_media;

#[cfg(desktop)]
use tauri::{Manager, WindowEvent};
#[cfg(desktop)]
use tray::{
    confirm_close_action, get_close_action_pref, handle_close_requested, set_close_action_pref,
    setup_tray, WindowPrefsState,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(desktop)]
    run_desktop();

    #[cfg(mobile)]
    run_mobile();
}

#[cfg(desktop)]
fn run_desktop() {
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

#[cfg(mobile)]
fn run_mobile() {
    let mut builder = tauri::Builder::default().plugin(tauri_plugin_http::init());

    #[cfg(target_os = "android")]
    {
        builder = builder
            .plugin(android_updater::init_plugin())
            .plugin(android_media::init_plugin())
            .invoke_handler(tauri::generate_handler![
                android_updater::android_download_apk,
                android_updater::android_install_apk,
                android_updater::android_can_install_packages,
                android_updater::android_request_install_permission,
                android_media::android_write_media_to_cache,
                android_media::android_download_media_to_cache,
                android_media::android_save_media_to_gallery
            ]);
    }

    builder
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
