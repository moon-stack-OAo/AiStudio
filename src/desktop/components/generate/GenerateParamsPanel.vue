<script setup>
/**
 * Desktop 双栏工作室右侧参数面板壳：可滚动字段区 + 底部操作区。
 * 字段由父组件 slot 传入，避免绑死 image/video 协议。
 */
defineProps({
  title: {type: String, default: '参数'},
})
</script>

<template>
  <aside class="params-panel">
    <div class="params-head">
      <h3>{{ title }}</h3>
    </div>
    <div class="params-scroll">
      <slot />
    </div>
    <div v-if="$slots.actions" class="params-actions">
      <slot name="actions" />
    </div>
  </aside>
</template>

<style lang="scss" scoped>
@use '@/styles/generate-workspace.scss';
</style>
