package com.moon.aistudio

import android.app.Activity
import android.content.ContentValues
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.Plugin
import java.io.File
import java.io.FileInputStream

/**
 * 将应用缓存内的图片/视频写入系统相册（MediaStore）。
 * 源文件位于 src-tauri/android/；需经 sync-android-updater-sources.mjs 同步到 gen/android。
 */
@TauriPlugin
class MediaSaverPlugin(private val activity: Activity) : Plugin(activity) {
  @InvokeArg
  class SaveArgs {
    var path: String? = null
    var mimeType: String? = null
    var displayName: String? = null
  }

  @Command
  fun saveToGallery(invoke: Invoke) {
    val args = invoke.parseArgs(SaveArgs::class.java)
    val path = args.path
    if (path.isNullOrBlank()) {
      invoke.reject("未提供文件路径")
      return
    }

    val file = File(path)
    if (!file.isFile) {
      invoke.reject("文件不存在或不是文件: $path")
      return
    }

    val mime = args.mimeType?.trim().orEmpty().ifEmpty {
      guessMime(file.name)
    }
    val displayName = args.displayName?.trim().orEmpty().ifEmpty {
      file.name
    }
    val isVideo = mime.startsWith("video/")

    try {
      val uri = insertAndCopy(file, mime, displayName, isVideo)
      if (uri == null) {
        invoke.reject("写入相册失败：无法创建 MediaStore 条目")
        return
      }
      invoke.resolve()
    } catch (e: SecurityException) {
      invoke.reject("没有写入相册权限: ${e.message ?: "SecurityException"}")
    } catch (e: Exception) {
      invoke.reject(e.message ?: "保存到相册失败")
    }
  }

  private fun insertAndCopy(
    file: File,
    mime: String,
    displayName: String,
    isVideo: Boolean,
  ): Uri? {
    val resolver = activity.contentResolver
    val collection: Uri = if (isVideo) {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
      } else {
        MediaStore.Video.Media.EXTERNAL_CONTENT_URI
      }
    } else {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
      } else {
        MediaStore.Images.Media.EXTERNAL_CONTENT_URI
      }
    }

    val relativePath = if (isVideo) "Movies/AI Studio" else "Pictures/AI Studio"
    val values = ContentValues().apply {
      put(MediaStore.MediaColumns.DISPLAY_NAME, displayName)
      put(MediaStore.MediaColumns.MIME_TYPE, mime)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        put(MediaStore.MediaColumns.RELATIVE_PATH, relativePath)
        put(MediaStore.MediaColumns.IS_PENDING, 1)
      }
    }

    val itemUri = resolver.insert(collection, values)
      ?: return null

    try {
      val out = resolver.openOutputStream(itemUri)
        ?: throw IllegalStateException("无法打开输出流")
      out.use { output ->
        FileInputStream(file).use { input ->
          input.copyTo(output)
        }
      }

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        values.clear()
        values.put(MediaStore.MediaColumns.IS_PENDING, 0)
        resolver.update(itemUri, values, null, null)
      }
      return itemUri
    } catch (e: Exception) {
      try {
        resolver.delete(itemUri, null, null)
      } catch (_: Exception) {
      }
      throw e
    }
  }

  private fun guessMime(name: String): String {
    val lower = name.lowercase()
    return when {
      lower.endsWith(".png") -> "image/png"
      lower.endsWith(".jpg") || lower.endsWith(".jpeg") -> "image/jpeg"
      lower.endsWith(".webp") -> "image/webp"
      lower.endsWith(".gif") -> "image/gif"
      lower.endsWith(".mp4") -> "video/mp4"
      lower.endsWith(".webm") -> "video/webm"
      lower.endsWith(".mkv") -> "video/x-matroska"
      lower.endsWith(".mov") -> "video/quicktime"
      else -> "application/octet-stream"
    }
  }
}
