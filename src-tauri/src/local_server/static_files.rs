//! 静态资源托管：debug 反向代理 Vite；release ServeDir + SPA fallback

use axum::{
  body::Body,
  extract::{Request, State},
  http::{header, StatusCode},
  response::{IntoResponse, Response},
};
use http_body_util::BodyExt;
use std::path::{Path, PathBuf};
use tower::ServiceExt;
use tower_http::services::ServeFile;

use super::auth::{is_authorized, maybe_attach_cookie};
use super::state::SharedState;

/// Vite 开发服地址（与 tauri.conf.json devUrl 一致）
const VITE_DEV_ORIGIN: &str = "http://127.0.0.1:5173";

/// SPA / 静态入口：需鉴权；成功后可写 Cookie
pub async fn handle_spa(State(state): State<SharedState>, req: Request) -> Response {
  if !is_authorized(&state, &req) {
    return (
      StatusCode::UNAUTHORIZED,
      axum::Json(serde_json::json!({
        "ok": false,
        "error": "unauthorized",
        "message": "请通过带 token 的地址访问，例如 http://127.0.0.1:<port>/?t=<token>"
      })),
    )
      .into_response();
  }

  // 保留 uri/headers 供写 Cookie（body 会被后续消费）
  let uri = req.uri().clone();
  let headers = req.headers().clone();

  let res = if cfg!(debug_assertions) {
    proxy_to_vite(req).await
  } else {
    serve_release_static(req).await
  };

  let mut cookie_req = Request::builder()
    .uri(uri)
    .body(Body::empty())
    .expect("cookie req");
  *cookie_req.headers_mut() = headers;
  maybe_attach_cookie(&state, &cookie_req, res)
}

/// debug：把请求转发到 Vite（一期不透传 HMR WebSocket）
async fn proxy_to_vite(req: Request) -> Response {
  let path_and_query = req
    .uri()
    .path_and_query()
    .map(|pq| pq.as_str())
    .unwrap_or("/");

  let target = format!("{}{}", VITE_DEV_ORIGIN, path_and_query);

  let client = match reqwest::Client::builder()
    .redirect(reqwest::redirect::Policy::none())
    .build()
  {
    Ok(c) => c,
    Err(e) => {
      return (
        StatusCode::BAD_GATEWAY,
        format!("创建代理客户端失败: {}", e),
      )
        .into_response();
    }
  };

  let method = req.method().clone();
  let headers = req.headers().clone();
  let body_bytes = match req.into_body().collect().await {
    Ok(c) => c.to_bytes(),
    Err(e) => {
      return (
        StatusCode::BAD_GATEWAY,
        format!("读取请求体失败: {}", e),
      )
        .into_response();
    }
  };

  let mut builder = client.request(
    reqwest::Method::from_bytes(method.as_str().as_bytes()).unwrap_or(reqwest::Method::GET),
    &target,
  );

  for (key, value) in headers.iter() {
    if key == header::HOST {
      continue;
    }
    if let (Ok(k), Ok(v)) = (
      reqwest::header::HeaderName::from_bytes(key.as_str().as_bytes()),
      reqwest::header::HeaderValue::from_bytes(value.as_bytes()),
    ) {
      builder = builder.header(k, v);
    }
  }

  let upstream = match builder.body(body_bytes.to_vec()).send().await {
    Ok(r) => r,
    Err(e) => {
      return (
        StatusCode::BAD_GATEWAY,
        format!(
          "无法连接 Vite 开发服 {}：{}。请确认已执行 npm run tauri:dev / npm run dev",
          VITE_DEV_ORIGIN, e
        ),
      )
        .into_response();
    }
  };

  let status =
    StatusCode::from_u16(upstream.status().as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);
  let mut response_builder = Response::builder().status(status);
  for (key, value) in upstream.headers().iter() {
    let name = key.as_str();
    if name.eq_ignore_ascii_case("transfer-encoding")
      || name.eq_ignore_ascii_case("content-length")
    {
      continue;
    }
    response_builder = response_builder.header(key.as_str(), value.as_bytes());
  }

  let bytes = match upstream.bytes().await {
    Ok(b) => b,
    Err(e) => {
      return (
        StatusCode::BAD_GATEWAY,
        format!("读取 Vite 响应失败: {}", e),
      )
        .into_response();
    }
  };

  response_builder
    .body(Body::from(bytes))
    .unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response())
}

/// release：从 dist 提供静态文件，未知路径回退 index.html（hash 路由）
async fn serve_release_static(req: Request) -> Response {
  let path = req.uri().path().to_string();
  let root = resolve_static_root();

  if !root.exists() {
    return (
      StatusCode::SERVICE_UNAVAILABLE,
      "静态资源目录不存在，请先执行 npm run build 或检查 Tauri resource",
    )
      .into_response();
  }

  let rel = path.trim_start_matches('/');
  let candidate = if rel.is_empty() {
    root.join("index.html")
  } else {
    root.join(rel)
  };

  let Ok(canon_root) = root.canonicalize() else {
    return (StatusCode::INTERNAL_SERVER_ERROR, "无法解析静态根目录").into_response();
  };

  if candidate.exists() && candidate.is_file() {
    if let Ok(canon_file) = candidate.canonicalize() {
      if canon_file.starts_with(&canon_root) {
        return match ServeFile::new(&candidate)
          .oneshot(Request::new(Body::empty()))
          .await
        {
          Ok(res) => res.map(Body::new),
          Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
        };
      }
    }
  }

  let looks_like_asset = Path::new(rel)
    .extension()
    .and_then(|e| e.to_str())
    .map(|e| !e.is_empty())
    .unwrap_or(false);

  if looks_like_asset {
    return (StatusCode::NOT_FOUND, "Not Found").into_response();
  }

  let index = root.join("index.html");
  match ServeFile::new(&index)
    .oneshot(Request::new(Body::empty()))
    .await
  {
    Ok(res) => res.map(Body::new),
    Err(_) => (
      StatusCode::INTERNAL_SERVER_ERROR,
      "无法读取 index.html",
    )
      .into_response(),
  }
}

/// 解析静态根目录
fn resolve_static_root() -> PathBuf {
  if let Ok(p) = std::env::var("AI_STUDIO_STATIC_DIR") {
    return PathBuf::from(p);
  }

  if let Ok(exe) = std::env::current_exe() {
    if let Some(dir) = exe.parent() {
      let candidates = [
        dir.join("resources").join("dist"),
        dir.join("dist"),
        dir.join("..").join("dist"),
        dir.join("..").join("..").join("dist"),
      ];
      for c in candidates {
        if c.join("index.html").exists() {
          return c;
        }
      }
    }
  }

  let cwd_dist = PathBuf::from("../dist");
  if cwd_dist.join("index.html").exists() {
    return cwd_dist;
  }

  PathBuf::from("../dist")
}
