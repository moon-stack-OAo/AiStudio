// 发布版隐藏额外控制台窗口（Windows），请勿删除
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
  app_lib::run();
}
