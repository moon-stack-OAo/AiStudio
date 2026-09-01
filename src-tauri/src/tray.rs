//! 系统托盘与关闭行为（退出 / 最小化到托盘）

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, Runtime,
};

const PREFS_FILE: &str = "window_prefs.json";

/// 关闭行为偏好
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub enum CloseActionPref {
    /// 每次询问
    #[default]
    Ask,
    /// 直接退出
    Quit,
    /// 最小化到托盘
    Tray,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct WindowPrefs {
    #[serde(default)]
    close_action: CloseActionPref,
}

#[derive(Debug)]
pub struct WindowPrefsState {
    path: PathBuf,
    prefs: Mutex<WindowPrefs>,
}

impl WindowPrefsState {
    pub fn load(app_config_dir: Option<PathBuf>) -> Self {
        let dir =
            app_config_dir.unwrap_or_else(|| std::env::temp_dir().join("ai-studio-window-prefs"));
        let path = dir.join(PREFS_FILE);
        let prefs = match fs::read_to_string(&path) {
            Ok(text) => serde_json::from_str(&text).unwrap_or_default(),
            Err(_) => WindowPrefs::default(),
        };
        Self {
            path,
            prefs: Mutex::new(prefs),
        }
    }

    pub fn close_action(&self) -> CloseActionPref {
        self.prefs
            .lock()
            .map(|g| g.close_action)
            .unwrap_or(CloseActionPref::Ask)
    }

    pub fn set_close_action(&self, action: CloseActionPref) -> Result<(), String> {
        let mut guard = self.prefs.lock().map_err(|e| e.to_string())?;
        guard.close_action = action;
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("创建配置目录失败: {}", e))?;
        }
        let text =
            serde_json::to_string_pretty(&*guard).map_err(|e| format!("序列化失败: {}", e))?;
        fs::write(&self.path, text).map_err(|e| format!("写入失败: {}", e))?;
        Ok(())
    }
}

fn show_main_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.unminimize();
        let _ = win.show();
        let _ = win.set_focus();
    }
}

fn hide_main_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.hide();
    }
}

fn emit_tray_action<R: Runtime>(app: &AppHandle<R>, action: &str) {
    show_main_window(app);
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.emit("tray-action", action);
    }
}

/// 创建托盘：左键显示主窗口；菜单含显示 / 对话 / 设置 / 检查更新 / 退出
pub fn setup_tray<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let show_i = MenuItem::with_id(app, "show", "显示主窗口", true, None::<&str>)?;
    let chat_i = MenuItem::with_id(app, "open-chat", "打开对话", true, None::<&str>)?;
    let settings_i = MenuItem::with_id(app, "open-settings", "设置", true, None::<&str>)?;
    let update_i = MenuItem::with_id(app, "check-update", "检查更新", true, None::<&str>)?;
    let quit_i = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let sep1 = PredefinedMenuItem::separator(app)?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(
        app,
        &[&show_i, &sep1, &chat_i, &settings_i, &update_i, &sep2, &quit_i],
    )?;

    let version = app.package_info().version.to_string();
    let tooltip = format!("AI Studio v{}", version);

    let mut builder = TrayIconBuilder::new()
        .menu(&menu)
        .tooltip(&tooltip)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_main_window(app),
            "open-chat" => emit_tray_action(app, "open-chat"),
            "open-settings" => emit_tray_action(app, "open-settings"),
            "check-update" => emit_tray_action(app, "check-update"),
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }

    builder.build(app)?;
    Ok(())
}

/// 处理主窗口关闭请求
pub fn handle_close_requested<R: Runtime>(app: &AppHandle<R>, api: &tauri::CloseRequestApi) {
    let action = app
        .try_state::<WindowPrefsState>()
        .map(|s| s.close_action())
        .unwrap_or(CloseActionPref::Ask);

    match action {
        CloseActionPref::Quit => {
            // 有托盘时仅关窗口不会结束进程，需显式退出
            api.prevent_close();
            app.exit(0);
        }
        CloseActionPref::Tray => {
            api.prevent_close();
            hide_main_window(app);
        }
        CloseActionPref::Ask => {
            api.prevent_close();
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.show();
                let _ = win.set_focus();
                let _ = win.emit("ask-close", ());
            }
        }
    }
}

/// 前端确认关闭行为
#[tauri::command]
pub fn confirm_close_action(app: AppHandle, action: String, remember: bool) -> Result<(), String> {
    let pref = match action.as_str() {
        "quit" => CloseActionPref::Quit,
        "tray" => CloseActionPref::Tray,
        _ => return Err("无效的关闭行为".into()),
    };

    if remember {
        if let Some(state) = app.try_state::<WindowPrefsState>() {
            state.set_close_action(pref)?;
        }
    }

    match pref {
        CloseActionPref::Quit => {
            app.exit(0);
        }
        CloseActionPref::Tray => {
            hide_main_window(&app);
        }
        CloseActionPref::Ask => {}
    }
    Ok(())
}

#[tauri::command]
pub fn get_close_action_pref(state: tauri::State<'_, WindowPrefsState>) -> String {
    match state.close_action() {
        CloseActionPref::Ask => "ask".into(),
        CloseActionPref::Quit => "quit".into(),
        CloseActionPref::Tray => "tray".into(),
    }
}

#[tauri::command]
pub fn set_close_action_pref(
    state: tauri::State<'_, WindowPrefsState>,
    action: String,
) -> Result<(), String> {
    let pref = match action.as_str() {
        "ask" => CloseActionPref::Ask,
        "quit" => CloseActionPref::Quit,
        "tray" => CloseActionPref::Tray,
        _ => return Err("无效的关闭行为".into()),
    };
    state.set_close_action(pref)
}
