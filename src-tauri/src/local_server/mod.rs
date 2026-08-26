//! 本机 HTTP 服务：静态托管 + token 鉴权；为二期 WS、三期 API 代理预留路由

mod auth;
mod http;
mod proxy;
mod state;
mod static_files;
mod ws;

pub use http::start_local_server;
pub use state::{LocalServerHandle, LocalServerInfo, SetLocalServerConfigResult};
