<template>
  <div class="border rounded-lg p-5">
    <div class="flex items-center justify-between mb-3">
      <h3 class="font-semibold text-lg">{{ result.ticker || ticker }}</h3>
      <MarketSignalBadge :signal="result.signal || 'NONE'" />
    </div>

    <p v-if="result.summary" class="text-sm text-muted-foreground mb-3">{{ result.summary }}</p>

    <div v-if="result.confidence" class="mb-3">
      <div class="text-sm text-muted-foreground mb-1">置信度 {{ result.confidence }}%</div>
      <div class="w-full bg-muted rounded-full h-2">
        <div class="h-2 rounded-full" :class="barColor" :style="{ width: result.confidence + '%' }" />
      </div>
    </div>

    <div v-if="result.reasons?.length" class="mb-3">
      <div class="text-sm font-medium mb-1">核心理由</div>
      <ul class="text-sm list-disc list-inside text-muted-foreground">
        <li v-for="r in result.reasons" :key="r">{{ r }}</li>
      </ul>
    </div>

    <div v-if="result.risks?.length">
      <div class="text-sm font-medium mb-1">风险提示</div>
      <ul class="text-sm list-disc list-inside text-red-600 dark:text-red-400">
        <li v-for="r in result.risks" :key="r">{{ r }}</li>
      </ul>
    </div>

    <div v-if="result.suggestion" class="mt-3 p-3 bg-muted rounded text-sm">
      {{ result.suggestion }}
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  ticker: string
  result: Record<string, any>
}>()

const barColor = computed(() => {
  if (props.result.signal === 'BUY') return 'bg-green-500'
  if (props.result.signal === 'SELL') return 'bg-red-500'
  return 'bg-yellow-500'
})
</script>
