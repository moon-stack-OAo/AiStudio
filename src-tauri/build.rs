fn main() {
    // 为自定义 command 生成 allow-*/deny-* 权限，并在 capabilities 中显式授权
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "confirm_close_action",
            "get_close_action_pref",
            "set_close_action_pref",
        ]),
    ))
    .expect("tauri build 配置无效");
}
