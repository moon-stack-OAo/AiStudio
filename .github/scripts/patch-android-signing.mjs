#!/usr/bin/env node
/**
 * 为 gen/android/app/build.gradle.kts 注入 release 签名配置（幂等）
 * 用法: node .github/scripts/patch-android-signing.mjs
 */
import fs from 'node:fs'
import path from 'node:path'

const gradlePath = path.join(
  process.cwd(),
  'src-tauri',
  'gen',
  'android',
  'app',
  'build.gradle.kts',
)

if (!fs.existsSync(gradlePath)) {
  console.error(`未找到 ${gradlePath}，请先执行 tauri android init`)
  process.exit(1)
}

let text = fs.readFileSync(gradlePath, 'utf8')

if (!text.includes('import java.io.FileInputStream')) {
  if (text.includes('import java.util.Properties')) {
    text = text.replace(
      'import java.util.Properties',
      'import java.util.Properties\nimport java.io.FileInputStream',
    )
  } else {
    text = `import java.io.FileInputStream\n${text}`
  }
}

const signingBlock = `    signingConfigs {
        create("release") {
            val keystorePropertiesFile = rootProject.file("keystore.properties")
            val keystoreProperties = Properties()
            if (keystorePropertiesFile.exists()) {
                keystoreProperties.load(FileInputStream(keystorePropertiesFile))
            }
            keyAlias = keystoreProperties["keyAlias"] as String
            keyPassword = keystoreProperties["password"] as String
            storeFile = file(keystoreProperties["storeFile"] as String)
            storePassword = keystoreProperties["password"] as String
        }
    }
`

if (!/signingConfigs\s*\{[\s\S]*?create\("release"\)/.test(text)) {
  if (!/buildTypes\s*\{/.test(text)) {
    console.error('build.gradle.kts 中未找到 buildTypes 块，无法注入签名配置')
    process.exit(1)
  }
  text = text.replace(/(\s*)buildTypes\s*\{/, `\n${signingBlock}$1buildTypes {`)
}

if (
  !/getByName\("release"\)\s*\{[\s\S]*?signingConfig\s*=\s*signingConfigs\.getByName\("release"\)/.test(
    text,
  )
) {
  text = text.replace(
    /getByName\("release"\)\s*\{/,
    `getByName("release") {
            signingConfig = signingConfigs.getByName("release")`,
  )
}

fs.writeFileSync(gradlePath, text, 'utf8')
console.log(`已更新 Android release 签名配置: ${gradlePath}`)
