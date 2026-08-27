buildscript {
    repositories {
        google()
        mavenCentral()
    }
    dependencies {
        // 本地 Android Studio (AI-241) 最高支持 AGP 8.5.2；升级 Studio 后可改回 8.11.0
        // 注意：tauri android init 可能覆盖本文件
        classpath("com.android.tools.build:gradle:8.5.2")
        classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:1.9.25")
    }
}

allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

// 强制所有 Android 模块使用本机已安装的 Build Tools，避免自动拉取 34.0.0（代理失败）
subprojects {
    plugins.withId("com.android.library") {
        extensions.configure<com.android.build.gradle.LibraryExtension>("android") {
            buildToolsVersion = "36.1.0"
        }
    }
    plugins.withId("com.android.application") {
        extensions.configure<com.android.build.gradle.AppExtension>("android") {
            buildToolsVersion = "36.1.0"
        }
    }
}

tasks.register("clean").configure {
    delete("build")
}

