package com.moon.aistudio

import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import kotlin.math.roundToInt

class MainActivity : TauriActivity() {
  private val safeAreaBridge = SafeAreaBridge()
  private val systemBarsBridge = SystemBarsBridge()
  private var hostWebView: WebView? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    // 默认跟随深色 App 主题：浅色系统栏图标（深色背景上可见）
    applySystemBarAppearance(lightIcons = false)
  }

  /**
   * Android WebView（尤其是 < 140）在 edge-to-edge 下常把
   * env(safe-area-inset-*) 报告为 0。把系统栏/刘海 insets
   * 写入 CSS 变量，并暴露 JS Bridge 供前端在页面加载后补读。
   *
   * SystemBarsBridge：按 App 主题同步 status/navigation bar 图标明暗，
   * 避免「深色 App + 浅色系统」时图标不可见。
   * 源文件位于 src-tauri/android/；CI / 本地需同步到 gen/android（见 sync 脚本）。
   * 若执行 `tauri android init` 可能被覆盖，需重新合入。
   */
  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    hostWebView = webView
    webView.addJavascriptInterface(safeAreaBridge, "TauriSafeAreaInsets")
    webView.addJavascriptInterface(systemBarsBridge, "TauriSystemBars")

    ViewCompat.setOnApplyWindowInsetsListener(webView) { _, insets ->
      val safe = insets.getInsets(
        WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout(),
      )
      val density = resources.displayMetrics.density.coerceAtLeast(0.01f)
      safeAreaBridge.topPx = (safe.top / density).roundToInt()
      safeAreaBridge.rightPx = (safe.right / density).roundToInt()
      safeAreaBridge.bottomPx = (safe.bottom / density).roundToInt()
      safeAreaBridge.leftPx = (safe.left / density).roundToInt()
      injectSafeAreaCss(webView)
      insets
    }
    ViewCompat.requestApplyInsets(webView)
    // 首屏 document 可能尚未就绪或随后被替换，延迟再注入一次
    webView.post { injectSafeAreaCss(webView) }
    webView.postDelayed({ injectSafeAreaCss(webView) }, 300)
    webView.postDelayed({ injectSafeAreaCss(webView) }, 1000)
  }

  private fun injectSafeAreaCss(webView: WebView) {
    val script =
      """
      (function () {
        var r = document.documentElement;
        if (!r || !r.style) return;
        r.style.setProperty('--safe-area-inset-top', '${safeAreaBridge.topPx}px');
        r.style.setProperty('--safe-area-inset-right', '${safeAreaBridge.rightPx}px');
        r.style.setProperty('--safe-area-inset-bottom', '${safeAreaBridge.bottomPx}px');
        r.style.setProperty('--safe-area-inset-left', '${safeAreaBridge.leftPx}px');
      })();
      """.trimIndent()
    webView.evaluateJavascript(script, null)
  }

  /** lightIcons=true：深色图标（浅色背景）；false：浅色图标（深色背景） */
  private fun applySystemBarAppearance(lightIcons: Boolean) {
    val controller = WindowCompat.getInsetsController(window, window.decorView)
    // isAppearanceLight* = true 表示使用深色图标（适合浅色栏背景）
    controller.isAppearanceLightStatusBars = lightIcons
    controller.isAppearanceLightNavigationBars = lightIcons
  }

  class SafeAreaBridge {
    @Volatile var topPx: Int = 0
    @Volatile var rightPx: Int = 0
    @Volatile var bottomPx: Int = 0
    @Volatile var leftPx: Int = 0

    @JavascriptInterface fun top(): Int = topPx
    @JavascriptInterface fun right(): Int = rightPx
    @JavascriptInterface fun bottom(): Int = bottomPx
    @JavascriptInterface fun left(): Int = leftPx
  }

  inner class SystemBarsBridge {
    /**
     * @param theme "light" | "dark"（与前端 data-theme 一致）
     */
    @JavascriptInterface
    fun setTheme(theme: String) {
      val lightApp = theme.equals("light", ignoreCase = true)
      runOnUiThread {
        // 浅色 App → 深色系统栏图标；深色 App → 浅色系统栏图标
        applySystemBarAppearance(lightIcons = lightApp)
      }
    }
  }
}
