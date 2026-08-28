package com.moon.aistudio

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.activity.result.ActivityResult
import androidx.core.content.FileProvider
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.File

/**
 * Android 侧载更新：FileProvider + 系统安装器。
 * 源文件位于 src-tauri/android/；CI / 本地需同步到 gen/android（见 sync-android-updater-sources.mjs）。
 * 若执行 `tauri android init` 可能被覆盖，需重新合入。
 */
@TauriPlugin
class UpdaterPlugin(private val activity: Activity) : Plugin(activity) {
  @InvokeArg
  class PathArgs {
    var path: String? = null
  }

  @Command
  fun installApk(invoke: Invoke) {
    val path = invoke.parseArgs(PathArgs::class.java).path
    if (path.isNullOrBlank()) {
      invoke.reject("未提供 APK 路径")
      return
    }

    val file = File(path)
    if (!file.isFile) {
      invoke.reject("APK 不存在或不是文件: $path")
      return
    }

    val uri: Uri = try {
      FileProvider.getUriForFile(
        activity,
        "${activity.packageName}.fileprovider",
        file,
      )
    } catch (e: IllegalArgumentException) {
      invoke.reject(
        "APK 不在可分享目录内: $path。请下载到应用缓存目录。",
      )
      return
    }

    val intent = Intent(Intent.ACTION_VIEW).apply {
      setDataAndType(uri, "application/vnd.android.package-archive")
      addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
    }

    try {
      activity.startActivity(intent)
      invoke.resolve()
    } catch (e: ActivityNotFoundException) {
      invoke.reject("系统无法处理 APK 安装请求")
    } catch (e: Exception) {
      invoke.reject(e.message ?: "调起安装器失败")
    }
  }

  @Command
  fun canInstallPackages(invoke: Invoke) {
    val ret = JSObject()
    ret.put("canInstall", canRequestInstalls())
    invoke.resolve(ret)
  }

  @Command
  fun requestInstallPermission(invoke: Invoke) {
    if (canRequestInstalls()) {
      invoke.resolve()
      return
    }
    val intent = Intent(
      Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
      Uri.parse("package:${activity.packageName}"),
    )
    try {
      startActivityForResult(invoke, intent, "installPermissionResult")
    } catch (e: ActivityNotFoundException) {
      invoke.reject("无法打开「安装未知应用」设置页")
    }
  }

  @ActivityCallback
  fun installPermissionResult(invoke: Invoke, result: ActivityResult) {
    invoke.resolve()
  }

  private fun canRequestInstalls(): Boolean {
    return Build.VERSION.SDK_INT < Build.VERSION_CODES.O ||
      activity.packageManager.canRequestPackageInstalls()
  }
}
