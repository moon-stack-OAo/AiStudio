fn main() {
  // 为自定义 command 生成 allow-*/deny-* 权限，并在 capabilities 中显式授权
  tauri_build::try_build(
    tauri_build::Attributes::new().app_manifest(
      tauri_build::AppManifest::new().commands(&[
        "get_local_server_info",
        "regenerate_local_token",
        "set_local_server_config",
      ]),
    ),
  )
  .expect("tauri build 配置无效");
}
