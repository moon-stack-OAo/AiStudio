//! Android 媒体保存：缓存落盘 + MediaStore 写入相册

use serde::{de::DeserializeOwned, Deserialize, Serialize};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::plugin::{Builder as PluginBuilder, PluginApi, PluginHandle, TauriPlugin};
use tauri::{AppHandle, Manager, Runtime};

const MAX_DOWNLOAD_BYTES: u64 = 500 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_SECS: u64 = 600;

#[derive(Clone)]
pub struct MediaSaverPluginHandle<R: Runtime>(PluginHandle<R>);

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveToGalleryArgs {
    path: String,
    mime_type: String,
    display_name: String,
}

fn media_cache_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    let base = app
        .path()
        .app_cache_dir()
        .map_err(|e| format!("无法获取缓存目录: {e}"))?;
    let dir = base.join("media_save");
    std::fs::create_dir_all(&dir).map_err(|e| format!("创建媒体缓存目录失败: {e}"))?;
    Ok(dir)
}

fn assert_path_in_cache(cache_dir: &Path, path: &Path) -> Result<(), String> {
    let cache_canon = cache_dir
        .canonicalize()
        .map_err(|e| format!("缓存目录无效: {e}"))?;
    let path_canon = path
        .canonicalize()
        .map_err(|e| format!("文件路径无效: {e}"))?;
    if !path_canon.starts_with(&cache_canon) {
        return Err("仅允许保存应用缓存目录内的文件".into());
    }
    Ok(())
}

fn sanitize_file_name(name: &str) -> String {
    let trimmed = name.trim();
    let base = if trimmed.is_empty() {
        "media"
    } else {
        trimmed
    };
    let safe: String = base
        .chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            c if c.is_control() => '_',
            c => c,
        })
        .collect();
    let safe = safe.trim_matches('.').trim();
    if safe.is_empty() {
        "media".into()
    } else {
        safe.chars().take(180).collect()
    }
}

fn unique_cache_path(cache_dir: &Path, display_name: &str) -> PathBuf {
    let safe = sanitize_file_name(display_name);
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    cache_dir.join(format!("{ts}_{safe}"))
}

fn guess_mime_from_name(name: &str) -> &'static str {
    let lower = name.to_ascii_lowercase();
    if lower.ends_with(".png") {
        "image/png"
    } else if lower.ends_with(".jpg") || lower.ends_with(".jpeg") {
        "image/jpeg"
    } else if lower.ends_with(".webp") {
        "image/webp"
    } else if lower.ends_with(".gif") {
        "image/gif"
    } else if lower.ends_with(".mp4") {
        "video/mp4"
    } else if lower.ends_with(".webm") {
        "video/webm"
    } else if lower.ends_with(".mkv") {
        "video/x-matroska"
    } else if lower.ends_with(".mov") {
        "video/quicktime"
    } else {
        "application/octet-stream"
    }
}

fn assert_download_url(url: &str) -> Result<reqwest::Url, String> {
    let parsed = reqwest::Url::parse(url).map_err(|e| format!("无效下载地址: {e}"))?;
    if parsed.scheme() != "https" && parsed.scheme() != "http" {
        return Err("仅允许 http/https 下载".into());
    }
    let Some(host) = parsed.host_str() else {
        return Err("下载地址缺少 host".into());
    };
    if crate::url_safety::is_blocked_fetch_host(host) {
        return Err("拒绝访问云元数据或受保护地址".into());
    }
    Ok(parsed)
}

#[tauri::command]
pub async fn android_write_media_to_cache<R: Runtime>(
    app: AppHandle<R>,
    bytes: Vec<u8>,
    file_name: String,
) -> Result<String, String> {
    if bytes.is_empty() {
        return Err("媒体数据为空".into());
    }
    if (bytes.len() as u64) > MAX_DOWNLOAD_BYTES {
        return Err(format!(
            "文件过大（上限 {} MB）",
            MAX_DOWNLOAD_BYTES / (1024 * 1024)
        ));
    }
    let cache_dir = media_cache_dir(&app)?;
    let dest = unique_cache_path(&cache_dir, &file_name);
    let mut file =
        std::fs::File::create(&dest).map_err(|e| format!("创建临时文件失败: {e}"))?;
    file.write_all(&bytes)
        .map_err(|e| format!("写入临时文件失败: {e}"))?;
    file.flush().map_err(|e| format!("刷新临时文件失败: {e}"))?;
    Ok(dest.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn android_download_media_to_cache<R: Runtime>(
    app: AppHandle<R>,
    url: String,
    file_name: Option<String>,
) -> Result<String, String> {
    let parsed = assert_download_url(&url)?;
    let name = file_name
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("media.bin");
    let cache_dir = media_cache_dir(&app)?;
    let dest = unique_cache_path(&cache_dir, name);
    let tmp = dest.with_extension("part");

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(DOWNLOAD_TIMEOUT_SECS))
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
    assert_download_url(final_url.as_str())?;

    if let Some(total) = response.content_length() {
        if total > MAX_DOWNLOAD_BYTES {
            return Err(format!(
                "文件过大（{} MB，上限 {} MB）",
                total / (1024 * 1024),
                MAX_DOWNLOAD_BYTES / (1024 * 1024)
            ));
        }
    }

    let mut file = std::fs::File::create(&tmp).map_err(|e| format!("创建临时文件失败: {e}"))?;
    let mut downloaded: u64 = 0;

    loop {
        let chunk = response
            .chunk()
            .await
            .map_err(|e| format!("下载中断: {e}"))?;
        let Some(chunk) = chunk else { break };
        downloaded = downloaded.saturating_add(chunk.len() as u64);
        if downloaded > MAX_DOWNLOAD_BYTES {
            drop(file);
            let _ = std::fs::remove_file(&tmp);
            return Err(format!(
                "文件过大（上限 {} MB）",
                MAX_DOWNLOAD_BYTES / (1024 * 1024)
            ));
        }
        file.write_all(&chunk)
            .map_err(|e| format!("写入失败: {e}"))?;
    }
    file.flush().map_err(|e| format!("刷新文件失败: {e}"))?;
    drop(file);

    if dest.exists() {
        let _ = std::fs::remove_file(&dest);
    }
    std::fs::rename(&tmp, &dest).map_err(|e| format!("保存临时文件失败: {e}"))?;
    Ok(dest.to_string_lossy().to_string())
}

#[tauri::command]
pub fn android_save_media_to_gallery<R: Runtime>(
    app: AppHandle<R>,
    path: String,
    mime_type: Option<String>,
    display_name: Option<String>,
) -> Result<(), String> {
    if path.trim().is_empty() {
        return Err("未提供文件路径".into());
    }
    let p = PathBuf::from(&path);
    if !p.is_file() {
        return Err(format!("文件不存在: {path}"));
    }

    let cache_dir = media_cache_dir(&app)?;
    assert_path_in_cache(&cache_dir, &p)?;

    let name = display_name
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| sanitize_file_name(s))
        .unwrap_or_else(|| {
            p.file_name()
                .and_then(|n| n.to_str())
                .map(sanitize_file_name)
                .unwrap_or_else(|| "media".into())
        });
    let mime = mime_type
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| guess_mime_from_name(&name))
        .to_string();

    let plugin = app
        .try_state::<MediaSaverPluginHandle<R>>()
        .ok_or_else(|| "Android MediaSaver 插件未初始化".to_string())?;

    let result = plugin.0.run_mobile_plugin::<()>(
        "saveToGallery",
        SaveToGalleryArgs {
            path: path.clone(),
            mime_type: mime,
            display_name: name,
        },
    );

    let _ = std::fs::remove_file(&p);

    result.map_err(|e| format!("保存到相册失败: {e}"))
}

fn register_native_plugin<R: Runtime, C: DeserializeOwned>(
    app: &AppHandle<R>,
    api: PluginApi<R, C>,
) -> Result<(), Box<dyn std::error::Error>> {
    let handle = api.register_android_plugin("com.moon.aistudio", "MediaSaverPlugin")?;
    app.manage(MediaSaverPluginHandle(handle));
    Ok(())
}

pub fn init_plugin<R: Runtime>() -> TauriPlugin<R> {
    PluginBuilder::new("android-media-saver")
        .setup(|app, api| {
            register_native_plugin(app, api)?;
            Ok(())
        })
        .build()
}
