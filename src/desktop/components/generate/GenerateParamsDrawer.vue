<script setup>
/**
 * 生成参数抽屉壳：底部 n-drawer + 标题 + 默认插槽（字段由父传入）+「完成」关闭。
 * 模式切换与具体表单项仍由父组件通过 slot 提供。
 */
defineProps({
  /** 是否显示，配合 v-model:show */
  show: {type: Boolean, default: false},
  /** 抽屉高度，如 '62%' / '78%' */
  height: {type: [String, Number], default: '62%'},
  /** 抽屉标题 */
  title: {type: String, default: '生成参数'},
})

const emit = defineEmits(['update:show'])

function close() {
  emit('update:show', false)
}
</script>

<template>
  <n-drawer
    :show="show"
    :height="height"
    display-directive="show"
    placement="bottom"
    @update:show="emit('update:show', $event)"
  >
    <n-drawer-content closable :title="title">
      <div class="params-drawer">
        <slot />
        <n-button block class="params-done" type="primary" @click="close"> 完成 </n-button>
      </div>
    </n-drawer-content>
  </n-drawer>
</template>

<style lang="scss" scoped>
/* 抽屉壳自身样式；字段区 class 仍由父级 generate-workspace 作用到 slot */
.params-drawer {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: var(--space-1) 2px max(var(--space-3), var(--safe-bottom));
}

.params-done {
  margin-top: var(--space-2);
  min-height: var(--touch-min);
}
</style>
