//! Token 鉴权中间件

use axum::{
  extract::Request,
  http::{header, StatusCode},
  middleware::Next,
  response::{IntoResponse, Response},
};

use super::state::{SharedState, TOKEN_COOKIE};

/// 从 query string 取 `t` 或 `token`
fn token_from_query(query: &str) -> Option<String> {
  for pair in query.split('&') {
    let mut it = pair.splitn(2, '=');
    let key = it.next().unwrap_or("");
    let val = it.next().unwrap_or("");
    if key == "t" || key == "token" {
      let decoded = url_decode(val);
      if !decoded.is_empty() {
        return Some(decoded);
      }
    }
  }
  None
}

fn url_decode(s: &str) -> String {
  let mut out = String::with_capacity(s.len());
  let bytes = s.as_bytes();
  let mut i = 0;
  while i < bytes.len() {
    match bytes[i] {
      b'+' => {
        out.push(' ');
        i += 1;
      }
      b'%' if i + 2 < bytes.len() => {
        let hex = &s[i + 1..i + 3];
        if let Ok(v) = u8::from_str_radix(hex, 16) {
          out.push(v as char);
          i += 3;
        } else {
          out.push('%');
          i += 1;
        }
      }
      c => {
        out.push(c as char);
        i += 1;
      }
    }
  }
  out
}

/// 从请求中提取 token：Query → Header → Cookie
pub fn extract_token(req: &Request) -> Option<String> {
  if let Some(query) = req.uri().query() {
    if let Some(t) = token_from_query(query) {
      return Some(t);
    }
  }

  if let Some(v) = req.headers().get("X-Access-Token") {
    if let Ok(s) = v.to_str() {
      let s = s.trim();
      if !s.is_empty() {
        return Some(s.to_string());
      }
    }
  }

  // Cookie 优先于 Authorization：代理上游 API 时 Authorization 为 API Key，不能当成本地 token
  if let Some(cookie_header) = req.headers().get(header::COOKIE) {
    if let Ok(s) = cookie_header.to_str() {
      let prefix = format!("{}=", TOKEN_COOKIE);
      for part in s.split(';') {
        let part = part.trim();
        if let Some(val) = part.strip_prefix(&prefix) {
          let val = val.trim();
          if !val.is_empty() {
            return Some(val.to_string());
          }
        }
      }
    }
  }

  if let Some(v) = req.headers().get(header::AUTHORIZATION) {
    if let Ok(s) = v.to_str() {
      let s = s.trim();
      if let Some(rest) = s
        .strip_prefix("Bearer ")
        .or_else(|| s.strip_prefix("bearer "))
      {
        let rest = rest.trim();
        if !rest.is_empty() {
          return Some(rest.to_string());
        }
      }
    }
  }

  None
}

fn expected_token(state: &SharedState) -> String {
  state
    .config
    .read()
    .expect("local server config lock")
    .token
    .clone()
}

/// 校验通过则继续；失败返回 401 JSON
pub async fn require_auth(
  axum::extract::State(state): axum::extract::State<SharedState>,
  req: Request,
  next: Next,
) -> Response {
  let expected = expected_token(&state);
  match extract_token(&req) {
    Some(got) if got == expected => next.run(req).await,
    _ => (
      StatusCode::UNAUTHORIZED,
      axum::Json(serde_json::json!({
        "ok": false,
        "error": "unauthorized",
        "message": "缺少或无效的访问令牌"
      })),
    )
      .into_response(),
  }
}

/// Set-Cookie 值：HttpOnly + SameSite=Lax + Path=/
pub fn set_token_cookie(token: &str) -> String {
  format!(
    "{}={}; Path=/; HttpOnly; SameSite=Lax",
    TOKEN_COOKIE, token
  )
}

/// 若请求带有效 query token，则在响应上写入 Cookie
pub fn maybe_attach_cookie(state: &SharedState, req: &Request, mut res: Response) -> Response {
  let expected = expected_token(state);
  if let Some(query) = req.uri().query() {
    if let Some(t) = token_from_query(query) {
      if t == expected {
        if let Ok(val) = header::HeaderValue::from_str(&set_token_cookie(&expected)) {
          res.headers_mut().append(header::SET_COOKIE, val);
        }
      }
    }
  }
  res
}

/// 校验 token 是否有效（供静态资源入口使用）
pub fn is_authorized(state: &SharedState, req: &Request) -> bool {
  let expected = expected_token(state);
  matches!(extract_token(req), Some(got) if got == expected)
}
