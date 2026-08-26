//! 二期 WebSocket：会话状态同步（hello / full_state / patch / ping）

use axum::{
  extract::{
    ws::{Message, WebSocket},
    State, WebSocketUpgrade,
  },
  response::IntoResponse,
};
use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use tokio::sync::mpsc;

use super::state::{SharedState, WS_MAX_MESSAGE_SIZE};

/// 出站帧：文本或协议 Pong
enum OutMsg {
  Text(String),
  Pong(Vec<u8>),
}

/// GET /ws —— 需鉴权（由上层 middleware 保证）
pub async fn ws_handler(
  ws: WebSocketUpgrade,
  State(state): State<SharedState>,
) -> impl IntoResponse {
  // 限制单帧大小，防止恶意大包
  ws.max_message_size(WS_MAX_MESSAGE_SIZE)
    .max_frame_size(WS_MAX_MESSAGE_SIZE)
    .on_upgrade(move |socket| handle_socket(socket, state))
}

async fn handle_socket(socket: WebSocket, state: SharedState) {
  let (mut sender, mut receiver) = socket.split();
  // 业务广播用 String 通道；本连接专用出站用 OutMsg
  let (hub_tx, mut hub_rx) = mpsc::unbounded_channel::<String>();
  let (out_tx, mut out_rx) = mpsc::unbounded_channel::<OutMsg>();

  let conn_id = state.ws_hub.register(hub_tx).await;
  log::info!("[local-server] ws 客户端已连接 conn_id={}", conn_id);

  // 桥接：hub 广播 → 本连接出站
  let bridge_tx = out_tx.clone();
  let bridge = tokio::spawn(async move {
    while let Some(text) = hub_rx.recv().await {
      if bridge_tx.send(OutMsg::Text(text)).is_err() {
        break;
      }
    }
  });

  // 出站写入
  let write_task = tokio::spawn(async move {
    while let Some(msg) = out_rx.recv().await {
      let frame = match msg {
        OutMsg::Text(t) => Message::Text(t.into()),
        OutMsg::Pong(d) => Message::Pong(d.into()),
      };
      if sender.send(frame).await.is_err() {
        break;
      }
    }
  });

  while let Some(Ok(msg)) = receiver.next().await {
    match msg {
      Message::Text(text) => {
        if text.len() > WS_MAX_MESSAGE_SIZE {
          let _ = out_tx.send(OutMsg::Text(
            json!({ "type": "error", "message": "消息过大" }).to_string(),
          ));
          continue;
        }
        if let Err(e) = handle_client_text(&state, conn_id, &out_tx, text.as_str()).await {
          log::warn!("[local-server] ws 处理失败 conn_id={}: {}", conn_id, e);
          let _ = out_tx.send(OutMsg::Text(
            json!({ "type": "error", "message": e }).to_string(),
          ));
        }
      }
      Message::Ping(data) => {
        if out_tx.send(OutMsg::Pong(data.to_vec())).is_err() {
          break;
        }
      }
      Message::Close(_) => break,
      Message::Binary(_) => {
        let _ = out_tx.send(OutMsg::Text(
          json!({ "type": "error", "message": "不支持二进制帧" }).to_string(),
        ));
      }
      _ => {}
    }
  }

  state.ws_hub.unregister(conn_id).await;
  bridge.abort();
  write_task.abort();
  log::info!("[local-server] ws 客户端已断开 conn_id={}", conn_id);
}

fn send_json(out_tx: &mpsc::UnboundedSender<OutMsg>, value: Value) {
  let _ = out_tx.send(OutMsg::Text(value.to_string()));
}

/// 处理客户端文本 JSON
async fn handle_client_text(
  state: &SharedState,
  conn_id: u64,
  out_tx: &mpsc::UnboundedSender<OutMsg>,
  text: &str,
) -> Result<(), String> {
  // 兼容一期纯文本 ping
  if text.eq_ignore_ascii_case("ping") {
    send_json(out_tx, json!({ "type": "pong" }));
    return Ok(());
  }

  let msg: Value = serde_json::from_str(text).map_err(|e| format!("JSON 无效: {}", e))?;
  let msg_type = msg
    .get("type")
    .and_then(|v| v.as_str())
    .ok_or_else(|| "缺少 type".to_string())?;

  match msg_type {
    "ping" => {
      send_json(out_tx, json!({ "type": "pong" }));
      Ok(())
    }
    "hello" => handle_hello(state, out_tx, &msg),
    "full_state" => handle_full_state(state, conn_id, &msg).await,
    "patch" => handle_patch(state, conn_id, &msg).await,
    other => Err(format!("未知消息类型: {}", other)),
  }
}

fn handle_hello(
  state: &SharedState,
  out_tx: &mpsc::UnboundedSender<OutMsg>,
  msg: &Value,
) -> Result<(), String> {
  let client_id = msg
    .get("clientId")
    .and_then(|v| v.as_str())
    .unwrap_or("")
    .to_string();
  if client_id.is_empty() {
    return Err("hello 缺少 clientId".into());
  }

  let snap = state
    .snapshot
    .read()
    .map_err(|_| "snapshot lock".to_string())?
    .clone();

  let welcome = if snap.has_state() {
    json!({
      "type": "welcome",
      "clientId": client_id,
      "rev": snap.rev,
      "state": snap.to_state_value(),
    })
  } else {
    json!({
      "type": "welcome",
      "clientId": client_id,
      "rev": snap.rev,
    })
  };

  send_json(out_tx, welcome);
  Ok(())
}

async fn handle_full_state(
  state: &SharedState,
  conn_id: u64,
  msg: &Value,
) -> Result<(), String> {
  let from = msg
    .get("clientId")
    .and_then(|v| v.as_str())
    .unwrap_or("")
    .to_string();
  let state_obj = msg
    .get("state")
    .cloned()
    .ok_or_else(|| "full_state 缺少 state".to_string())?;

  let rev = {
    let mut snap = state
      .snapshot
      .write()
      .map_err(|_| "snapshot lock".to_string())?;
    snap.apply_full(&state_obj);
    snap.rev
  };

  let outbound = json!({
    "type": "full_state",
    "from": from,
    "rev": rev,
    "state": state_obj,
  });

  state
    .ws_hub
    .broadcast_text(&outbound.to_string(), Some(conn_id))
    .await;
  Ok(())
}

async fn handle_patch(state: &SharedState, conn_id: u64, msg: &Value) -> Result<(), String> {
  let from = msg
    .get("clientId")
    .and_then(|v| v.as_str())
    .unwrap_or("")
    .to_string();
  let store = msg
    .get("store")
    .and_then(|v| v.as_str())
    .ok_or_else(|| "patch 缺少 store".to_string())?
    .to_string();
  let data = msg
    .get("data")
    .cloned()
    .ok_or_else(|| "patch 缺少 data".to_string())?;

  let rev = {
    let mut snap = state
      .snapshot
      .write()
      .map_err(|_| "snapshot lock".to_string())?;
    snap.apply_patch(&store, data.clone())?;
    snap.rev
  };

  let outbound = json!({
    "type": "patch",
    "from": from,
    "rev": rev,
    "store": store,
    "data": data,
  });

  state
    .ws_hub
    .broadcast_text(&outbound.to_string(), Some(conn_id))
    .await;
  Ok(())
}
