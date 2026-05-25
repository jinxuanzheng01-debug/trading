<template>
  <div class="p-6 max-w-4xl mx-auto">
    <h1 class="text-2xl font-bold mb-6">AI 投研分析</h1>

    <!-- 分析输入 -->
    <div class="flex gap-3 mb-8">
      <input
        v-model="ticker"
        placeholder="输入代码，如 000001, AAPL, 0700.HK"
        class="flex-1 border rounded px-4 py-2"
        @keyup.enter="startAnalysis"
      />
      <select v-model="market" class="border rounded px-3 py-2">
        <option value="a_stock">A股</option>
        <option value="hk">港股</option>
        <option value="us">美股</option>
        <option value="crypto">加密</option>
      </select>
      <button
        class="bg-primary text-white px-6 py-2 rounded hover:opacity-90"
        :disabled="loading"
        @click="startAnalysis"
      >
        {{ loading ? '分析中...' : '快速分析' }}
      </button>
    </div>

    <!-- 当前分析结果 -->
    <div v-if="currentRunId" class="mb-8">
      <div v-if="streamStatus === 'connecting'" class="text-center py-12">
        <div class="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-3" />
        <p class="text-muted-foreground">正在分析 {{ currentTicker }}...</p>
      </div>

      <div v-else-if="(streamStatus === 'streaming' || streamStatus === 'completed') && streamData?.result">
        <ResearchAnalysisCard :ticker="currentTicker" :result="streamData.result" />
      </div>

      <div v-else-if="streamStatus === 'failed'" class="text-center py-8 text-red-500">
        分析失败，请重试
      </div>
    </div>

    <!-- 历史记录 -->
    <h2 class="text-lg font-semibold mb-4">分析历史</h2>
    <div v-if="history.length" class="space-y-2">
      <div
        v-for="run in history"
        :key="run.id"
        class="border rounded p-3 hover:bg-muted cursor-pointer"
        @click="viewResult(run)"
      >
        <div class="flex items-center justify-between">
          <div>
            <span class="font-medium">{{ run.ticker }}</span>
            <span class="text-sm text-muted-foreground ml-2">{{ run.market }} · {{ run.depth }}</span>
          </div>
          <div class="flex items-center gap-2">
            <MarketSignalBadge v-if="parseResult(run.result)?.signal" :signal="parseResult(run.result).signal" />
            <span class="text-xs text-muted-foreground">{{ formatDate(run.createdAt) }}</span>
          </div>
        </div>
      </div>
    </div>
    <div v-else class="text-muted-foreground">暂无分析记录</div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const ticker = ref('')
const market = ref('a_stock')
const loading = ref(false)
const currentRunId = ref('')
const currentTicker = ref('')
const history = ref<any[]>([])

const { triggerAnalysis, getAnalysisHistory } = useAnalysis()

const runIdRef = computed(() => currentRunId.value)
const { status: streamStatus, data: streamData } = useAnalysisStream(runIdRef)

const startAnalysis = async () => {
  if (!ticker.value) return
  loading.value = true
  try {
    const res = await triggerAnalysis(ticker.value, market.value, 'quick')
    currentRunId.value = String(res.runId)
    currentTicker.value = ticker.value
  } finally {
    loading.value = false
  }
}

const viewResult = (run: any) => {
  currentRunId.value = String(run.id)
  currentTicker.value = run.ticker
}

const parseResult = (result: any) => {
  if (!result) return {}
  return typeof result === 'string' ? JSON.parse(result) : result
}

const formatDate = (d: string) => {
  if (!d) return ''
  return new Date(d).toLocaleDateString('zh-CN')
}

onMounted(async () => {
  try {
    const data = await getAnalysisHistory()
    history.value = data as any[]
  } catch {}
})
</script>
