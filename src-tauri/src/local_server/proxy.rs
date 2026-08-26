//! 三期：上游 AI API 反向代理（对齐 Vite corsProxyPlugin，支持 SSE 流式透传）

use axum::{
  body::Body,
  extract::State,
  http::{header, HeaderMap, HeaderName, HeaderValue, Method, StatusCode},
  response::{IntoResponse, Response},
  Json,
};
use futures_util::TryStreamExt;
use http_body_util::BodyExt;
use std::time::Duration;

use super::state::SharedState;

/// 连接超时；整体不设读取超时，以便 SSE / 长流式对话
const CONNECT_TIMEOUT: Duration = Duration::from_secs(15);

/// hop-by-hop 与不应转发的请求头
fn is_hop_by_hop_request(name: &str) -> bool {
  matches!(
    name,
    "connection"
      | "keep-alive"
      | "proxy-authenticate"
      | "proxy-authorization"
      | "te"
      | "trailers"
      | "transfer-encoding"
      | "upgrade"
      | "host"
      | "content-length"
      | "origin"
      | "referer"
      | "x-proxy-target"
      | "x-access-token"
      | "cookie" // 本地鉴权 Cookie，勿泄漏到上游
  )
}

/// 响应侧过滤：避免与流式 body 冲突的编码头
fn is_hop_by_hop_response(name: &str) -> bool {
  matches!(
    name,
    "connection"
      | "keep-alive"
      | "proxy-authenticate"
      | "proxy-authorization"
      | "te"
      | "trailers"
      | "transfer-encoding"
      | "upgrade"
      | "content-encoding"
      | "content-length"
  )
}

fn err_json(status: StatusCode, msg: impl Into<String>) -> Response {
  (
    status,
    Json(serde_json::json!({
      "error": msg.into(),
    })),
  )
    .into_response()
}

/// 仅允许 http / https
fn validate_target_base(raw: &str) -> Result<String, String> {
  let base = raw.trim().trim_end_matches('/').to_string();
  if base.is_empty() {
    return Err("缺少 X-Proxy-Target（请填写 Base URL）".into());
  }
  let url = reqwest::Url::parse(&base).map_err(|_| "无效的 Base URL".to_string())?;
  match url.scheme() {
    "http" | "https" => Ok(base),
    other => Err(format!("仅允许 http/https，当前 scheme: {}", other)),
  }
}

/// 从路径取出 /api-proxy 或 /api/proxy 之后的 suffix
fn proxy_suffix(path: &str) -> &str {
  for prefix in ["/api-proxy", "/api/proxy"] {
    if let Some(rest) = path.strip_prefix(prefix) {
      if rest.is_empty() {
        return "/";
      }
      return rest;
    }
  }
  path
}

/// 拼接上游 URL：targetBase + suffix + query
fn build_target_url(
  target_base: &str,
  suffix: &str,
  query: Option<&str>,
) -> Result<reqwest::Url, String> {
  let base_with_slash = if target_base.ends_with('/') {
    target_base.to_string()
  } else {
    format!("{}/", target_base)
  };
  let mut url = reqwest::Url::parse(&base_with_slash)
    .map_err(|_| "无效的 Base URL".to_string())?;
  // join 相对路径（去掉前导 /，避免覆盖 path）
  let rel = suffix.trim_start_matches('/');
  if !rel.is_empty() {
    url = url
      .join(rel)
      .map_err(|_| "无效的代理路径".to_string())?;
  }
  if let Some(q) = query {
    url.set_query(Some(q));
  }
  if !matches!(url.scheme(), "http" | "https") {
    return Err("仅允许 http/https 目标".into());
  }
  Ok(url)
}

fn build_upstream_client() -> Result<reqwest::Client, String> {
  reqwest::Client::builder()
    .connect_timeout(CONNECT_TIMEOUT)
    // 不调用 timeout()：默认无整体超时，适配 SSE；连接阶段仍受 CONNECT_TIMEOUT 约束
    .redirect(reqwest::redirect::Policy::none())
    .build()
    .map_err(|e| format!("创建代理客户端失败: {}", e))
}

/// ANY /api-proxy/* 与 /api/proxy/*：按 X-Proxy-Target 转发，流式透传响应体
pub async fn proxy_handler(
  State(state): State<SharedState>,
  req: axum::extract::Request,
) -> Response {
  // 热开关：关闭时代理拒绝
  if !state.proxy_enabled() {
    return err_json(StatusCode::FORBIDDEN, "API 代理已禁用（可在设置中开启）");
  }

  // 预检：同源一般不需要；保留以便跨场景兼容
  if req.method() == Method::OPTIONS {
    return Response::builder()
      .status(StatusCode::NO_CONTENT)
      .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
      .header(
        header::ACCESS_CONTROL_ALLOW_METHODS,
        "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      )
      .header(
        header::ACCESS_CONTROL_ALLOW_HEADERS,
        req
          .headers()
          .get(header::ACCESS_CONTROL_REQUEST_HEADERS)
          .and_then(|v| v.to_str().ok())
          .unwrap_or("Authorization, Content-Type, X-Proxy-Target, X-Access-Token"),
      )
      .body(Body::empty())
      .unwrap_or_else(|_| StatusCode::NO_CONTENT.into_response());
  }

  let target_raw = req
    .headers()
    .get("x-proxy-target")
    .and_then(|v| v.to_str().ok())
    .unwrap_or("")
    .to_string();

  let target_base = match validate_target_base(&target_raw) {
    Ok(b) => b,
    Err(msg) => return err_json(StatusCode::BAD_REQUEST, msg),
  };

  let path = req.uri().path().to_string();
  let suffix = proxy_suffix(&path);
  let query = req.uri().query().map(|s| s.to_string());

  let target_url = match build_target_url(&target_base, suffix, query.as_deref()) {
    Ok(u) => u,
    Err(msg) => return err_json(StatusCode::BAD_REQUEST, msg),
  };

  let method = req.method().clone();
  let in_headers = req.headers().clone();

  let body_bytes = match req.into_body().collect().await {
    Ok(c) => c.to_bytes(),
    Err(e) => {
      return err_json(
        StatusCode::BAD_REQUEST,
        format!("读取请求体失败: {}", e),
      )
    }
  };

  let client = match build_upstream_client() {
    Ok(c) => c,
    Err(e) => return err_json(StatusCode::BAD_GATEWAY, e),
  };

  let mut upstream_req = client.request(
    reqwest::Method::from_bytes(method.as_str().as_bytes()).unwrap_or(reqwest::Method::GET),
    target_url.clone(),
  );

  let mut header_map = HeaderMap::new();
  for (name, value) in in_headers.iter() {
    let key = name.as_str();
    if is_hop_by_hop_request(key) {
      continue;
    }
    header_map.append(name.clone(), value.clone());
  }
  upstream_req = upstream_req.headers(header_map);

  if !matches!(method, Method::GET | Method::HEAD) {
    upstream_req = upstream_req.body(body_bytes.to_vec());
  }

  let upstream = match upstream_req.send().await {
    Ok(r) => r,
    Err(e) => {
      log::warn!("[local-server] 代理转发失败: {} -> {}", target_url, e);
      return err_json(
        StatusCode::BAD_GATEWAY,
        format!("代理转发失败: {}", e),
      );
    }
  };

  let status =
    StatusCode::from_u16(upstream.status().as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);
  let mut response_builder = Response::builder().status(status);

  if let Some(headers_mut) = response_builder.headers_mut() {
    for (name, value) in upstream.headers().iter() {
      let key = name.as_str();
      if is_hop_by_hop_response(key) {
        continue;
      }
      if let (Ok(n), Ok(v)) = (
        HeaderName::from_bytes(name.as_str().as_bytes()),
        HeaderValue::from_bytes(value.as_bytes()),
      ) {
        headers_mut.append(n, v);
      }
    }
    headers_mut.insert(
      header::ACCESS_CONTROL_ALLOW_ORIGIN,
      HeaderValue::from_static("*"),
    );
  }

  // 流式透传：不可整包缓冲（SSE / chat completions stream）
  let stream = upstream.bytes_stream().map_err(|e| {
    log::warn!("[local-server] 代理上游流错误: {}", e);
    std::io::Error::new(std::io::ErrorKind::Other, e.to_string())
  });

  match response_builder.body(Body::from_stream(stream)) {
    Ok(res) => res,
    Err(e) => err_json(
      StatusCode::INTERNAL_SERVER_ERROR,
      format!("构造代理响应失败: {}", e),
    ),
  }
}
