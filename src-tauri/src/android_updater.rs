//! Android 侧载更新：下载 APK（host 白名单 + 强制 sha256）并调起系统安装器

use serde::{de::DeserializeOwned, Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::io::Write;
use std::path::PathBuf;
use std::time::Duration;
use tauri::ipc::Channel;
use tauri::plugin::{Builder as PluginBuilder, PluginApi, PluginHandle, TauriPlugin};
use tauri::{AppHandle, Emitter, Manager, Runtime};

const ALLOWED_HOSTS: &[&str] = &[
    "github.com",
    "www.github.com",
    "objects.githubusercontent.com",
    "release-assets.githubusercontent.com",
    "github-releases.githubusercontent.com",
];

#[derive(Clone)]
pub struct UpdaterPluginHandle<R: Runtime>(PluginHandle<R>);

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct InstallPathArgs {
    path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CanInstallResult {
    can_install: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
    pub downloaded: u64,
    pub total: Option<u64>,
}

fn assert_allowed_url(url: &str) -> Result<reqwest::Url, String> {
    let parsed = reqwest::Url::parse(url).map_err(|e| format!("无效下载地址: {e}"))?;
    if parsed.scheme() != "https" {
        return Err("仅允许 HTTPS 下载".into());
    }
    let host = parsed
        .host_str()
        .ok_or_else(|| "下载地址缺少 host".to_string())?
        .to_ascii_lowercase();
    let ok = ALLOWED_HOSTS.iter().any(|h| *h == host)
        || host.ends_with(".githubusercontent.com");
    if !ok {
        return Err(format!("下载域名不在白名单内: {host}"));
    }
    Ok(parsed)
}

fn normalize_hex(s: &str) -> String {
    s.trim().to_ascii_lowercase()
}

#[tauri::command]
pub async fn android_download_apk<R: Runtime>(
    app: AppHandle<R>,
    url: String,
    sha256: Option<String>,
    on_progress: Channel<DownloadProgress>,
) -> Result<String, String> {
    let parsed = assert_allowed_url(&url)?;
    let expected = match sha256.as_ref().map(|s| normalize_hex(s)) {
        Some(e) if !e.is_empty() => {
            if e.len() != 64 || !e.chars().all(|c| c.is_ascii_hexdigit()) {
                return Err("sha256 格式无效".into());
            }
            e
        }
        _ => return Err("更新清单缺少完整性校验信息".into()),
    };

    let cache_dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| format!("无法获取缓存目录: {e}"))?;
    std::fs::create_dir_all(&cache_dir).map_err(|e| format!("创建缓存目录失败: {e}"))?;
    let dest: PathBuf = cache_dir.join("ai-studio-update.apk");
    let tmp: PathBuf = cache_dir.join("ai-studio-update.apk.part");

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(600))
        .redirect(reqwest::redirect::Policy::limited(10))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {e}"))?;

    let mut response = client
        .get(parsed)
        .send()
        .await
        .map_err(|e| format!("下载失败: {e}"))?;

    if !response.status().is_success() {
        return Err(format!("下载失败: HTTP {}", response.status()));
    }

    let final_url = response.url().clone();
    assert_allowed_url(final_url.as_str())?;

    let total = response.content_length();
    let mut file = std::fs::File::create(&tmp).map_err(|e| format!("创建临时文件失败: {e}"))?;
    let mut downloaded: u64 = 0;
    let mut hasher = Sha256::new();

    loop {
        let chunk = response
            .chunk()
            .await
            .map_err(|e| format!("下载中断: {e}"))?;
        let Some(chunk) = chunk else { break };
        file.write_all(&chunk)
            .map_err(|e| format!("写入失败: {e}"))?;
        hasher.update(&chunk);
        downloaded = downloaded.saturating_add(chunk.len() as u64);
        let progress = DownloadProgress {
            downloaded,
            total,
        };
        let _ = on_progress.send(progress.clone());
        let _ = app.emit("android-apk-download-progress", progress);
    }
    file.flush().map_err(|e| format!("刷新文件失败: {e}"))?;
    drop(file);

    let digest = format!("{:x}", hasher.finalize());
    if digest != expected {
        let _ = std::fs::remove_file(&tmp);
        return Err(format!(
            "APK 校验失败：期望 sha256={expected}，实际={digest}"
        ));
    }

    if dest.exists() {
        let _ = std::fs::remove_file(&dest);
    }
    std::fs::rename(&tmp, &dest).map_err(|e| format!("保存 APK 失败: {e}"))?;

    Ok(dest.to_string_lossy().to_string())
}

#[tauri::command]
pub fn android_install_apk<R: Runtime>(app: AppHandle<R>, path: String) -> Result<(), String> {
    if path.trim().is_empty() {
        return Err("未提供 APK 路径".into());
    }
    let p = PathBuf::from(&path);
    if !p.is_file() {
        return Err(format!("APK 不存在: {path}"));
    }
    let plugin = app
        .try_state::<UpdaterPluginHandle<R>>()
        .ok_or_else(|| "Android Updater 插件未初始化".to_string())?;
    plugin
        .0
        .run_mobile_plugin::<()>("installApk", InstallPathArgs { path })
        .map_err(|e| format!("调起安装器失败: {e}"))
}

#[tauri::command]
pub fn android_can_install_packages<R: Runtime>(app: AppHandle<R>) -> Result<bool, String> {
    let plugin = app
        .try_state::<UpdaterPluginHandle<R>>()
        .ok_or_else(|| "Android Updater 插件未初始化".to_string())?;
    let result: CanInstallResult = plugin
        .0
        .run_mobile_plugin("canInstallPackages", ())
        .map_err(|e| format!("查询安装权限失败: {e}"))?;
    Ok(result.can_install)
}

#[tauri::command]
pub fn android_request_install_permission<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    let plugin = app
        .try_state::<UpdaterPluginHandle<R>>()
        .ok_or_else(|| "Android Updater 插件未初始化".to_string())?;
    plugin
        .0
        .run_mobile_plugin::<()>("requestInstallPermission", ())
        .map_err(|e| format!("打开安装权限设置失败: {e}"))
}

fn register_native_plugin<R: Runtime, C: DeserializeOwned>(
    app: &AppHandle<R>,
    api: PluginApi<R, C>,
) -> Result<(), Box<dyn std::error::Error>> {
    let handle = api.register_android_plugin("com.moon.aistudio", "UpdaterPlugin")?;
    app.manage(UpdaterPluginHandle(handle));
    Ok(())
}

/// 注册 Kotlin UpdaterPlugin（命令在 run_mobile 的 invoke_handler 中挂载）
pub fn init_plugin<R: Runtime>() -> TauriPlugin<R> {
    PluginBuilder::new("android-updater")
        .setup(|app, api| {
            register_native_plugin(app, api)?;
            Ok(())
        })
        .build()
}
