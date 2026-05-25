<template>
  <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium" :class="badgeClass">
    {{ signal }}
  </span>
</template>

<script setup lang="ts">
const props = defineProps<{ signal: 'BUY' | 'HOLD' | 'SELL' | 'NONE' }>()

const badgeClass = computed(() => {
  switch (props.signal) {
    case 'BUY': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
    case 'HOLD': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
    case 'SELL': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
    default: return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
  }
})
</script>
