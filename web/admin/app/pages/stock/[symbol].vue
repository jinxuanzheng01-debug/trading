<script setup lang="ts">
const route = useRoute()
const { fetchStockDetail, fetchKlineData, setInterval, loadMoreKline, loading, error, stockDetail, klineData } = useStockDetail()

const symbol = computed(() => (route.params.symbol as string)?.toUpperCase())

const currentTab = ref('overview')

onMounted(async () => {
  await fetchStockDetail(symbol.value)
  await fetchKlineData(symbol.value)
})

watch(symbol, async (newSymbol) => {
  if (newSymbol) {
    await fetchStockDetail(newSymbol)
    await fetchKlineData(newSymbol)
  }
})

async function handleIntervalChange(interval: string) {
  setInterval(interval)
}

async function handleLoadMore() {
  if (stockDetail.value) {
    await loadMoreKline(stockDetail.value.info.symbol)
  }
}
</script>

<template>
  <main class="container mx-auto py-6 px-4 max-w-7xl">
    <!-- 加载状态 -->
    <div v-if="loading && !stockDetail" class="flex items-center justify-center h-[50vh]">
      <div class="text-center">
        <Icon name="i-lucide-loader-2" class="size-12 animate-spin text-muted-foreground mx-auto mb-4" />
        <p class="text-muted-foreground">加载中...</p>
      </div>
    </div>

    <!-- 错误状态 -->
    <div v-else-if="error" class="flex items-center justify-center h-[50vh]">
      <div class="text-center">
        <Icon name="i-lucide-alert-circle" class="size-12 text-destructive mx-auto mb-4" />
        <p class="text-destructive">{{ error }}</p>
        <Button variant="outline" class="mt-4" @click="fetchStockDetail(symbol)">
          重试
        </Button>
      </div>
    </div>

    <!-- 内容 -->
    <div v-else-if="stockDetail" class="space-y-6">
      <!-- 头部 -->
      <StockHeader :data="stockDetail" />

      <!-- K线图 -->
      <StockChart
        v-if="stockDetail && klineData.length > 0"
        :symbol="stockDetail.info.symbol"
        :data="klineData"
        :loading="loading"
        :has-more="true"
        @interval-change="handleIntervalChange"
        @load-more="handleLoadMore"
      />

      <!-- 标签页 -->
      <Tabs v-model="currentTab">
        <TabsList>
          <TabsTrigger value="overview">概览</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <StockOverview :data="stockDetail" />
        </TabsContent>
      </Tabs>
    </div>
  </main>
</template>
