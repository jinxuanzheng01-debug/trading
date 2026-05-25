<template>
  <div class="p-6 max-w-6xl mx-auto">
    <h1 class="text-2xl font-bold mb-6">策略回测</h1>
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div>
        <h2 class="text-lg font-semibold mb-3">配置</h2>
        <BacktestConfigForm @submit="handleSubmit" :loading="loading" />
      </div>
      <div>
        <h2 class="text-lg font-semibold mb-3">结果</h2>
        <BacktestResultPanel v-if="result" :result="result" />
        <div v-else class="text-muted-foreground border rounded p-8 text-center">
          提交回测配置后查看结果
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const loading = ref(false)
const result = ref<any>(null)
const { runBacktest } = useBacktest()

const handleSubmit = async (params: any) => {
  loading.value = true
  result.value = null
  try {
    result.value = await runBacktest(params)
  } finally {
    loading.value = false
  }
}
</script>
