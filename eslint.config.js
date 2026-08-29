import js from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'
import eslintConfigPrettier from 'eslint-config-prettier'
import globals from 'globals'

export default [
  {
    ignores: [
      'dist/**',
      'dist-desktop/**',
      'dist-android/**',
      'dist-ssr/**',
      'node_modules/**',
      'src-tauri/target/**',
      'src-tauri/gen/**',
      'public/**',
      'coverage/**',
      '.idea/**',
      '.vscode/**',
      '.playwright-mcp/**',
      'package-lock.json',
    ],
  },
  js.configs.recommended,
  ...pluginVue.configs['flat/essential'],
  {
    files: ['**/*.{js,mjs,cjs,vue}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      // 单文件路由视图 / App 等允许单词组件名
      'vue/multi-word-component-names': 'off',
      // 允许 _ 前缀表示有意未使用
      'no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      'no-empty': ['error', {allowEmptyCatch: true}],
      'no-console': 'off',
      // 业务里常见「包装 Error 再抛」；不强求 cause 链
      'preserve-caught-error': 'off',
      // 正则字符类中的 \- 等转义在现有代码里很常见
      'no-useless-escape': 'off',
      // try/catch 初值再赋值等模式；避免为过 lint 大改
      'no-useless-assignment': 'off',
    },
  },
  eslintConfigPrettier,
]
