<script setup lang="ts">
import type { StockDetailResponse } from '@/types/stock'

interface Props {
  data: StockDetailResponse
}

const props = defineProps<Props>()

const { formatLargeNumber, getChangeClass, getChangeIcon } = useStockDetail()

const quote = computed(() => props.data.quote)
const info = computed(() => props.data.info)
const metrics = computed(() => props.data.metrics)
</script>

<template>
  <div class="space-y-4">
    <!-- 头部：股票代码和名称 -->
    <div class="flex items-start justify-between">
      <div>
        <h1 class="text-3xl font-bold">{{ info.symbol }}</h1>
        <p class="text-lg text-muted-foreground mt-1">
          {{ info.nameCn || info.name }}
        </p>
        <div class="flex items-center gap-2 mt-2">
          <Badge variant="secondary">{{ info.exchange }}</Badge>
          <Badge v-if="info.sector" variant="outline">{{ info.sector }}</Badge>
        </div>
      </div>
      <StockWatchlistBtn :symbol="info.symbol" />
    </div>

    <!-- 价格部分 -->
    <div class="flex items-baseline gap-4">
      <span class="text-4xl font-bold">{{ quote.price.toFixed(2) }}</span>
      <span
        :class="[
          'text-xl font-medium flex items-center gap-1',
          getChangeClass(quote.changePercent)
        ]"
      >
        <Icon :name="getChangeIcon(quote.changePercent)" class="size-5" />
        {{ quote.change > 0 ? '+' : '' }}{{ quote.change.toFixed(2) }}
        ({{ quote.changePercent > 0 ? '+' : '' }}{{ quote.changePercent.toFixed(2) }}%)
      </span>
    </div>

    <!-- OHLC 和成交量 -->
    <div class="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
      <div>
        <span class="text-muted-foreground">今开</span>
        <span class="ml-2 font-medium">{{ quote.open.toFixed(2) }}</span>
      </div>
      <div>
        <span class="text-muted-foreground">最高</span>
        <span :class="['ml-2 font-medium', getChangeClass(quote.high - quote.prevClose)]">
          {{ quote.high.toFixed(2) }}
        </span>
      </div>
      <div>
        <span class="text-muted-foreground">最低</span>
        <span :class="['ml-2 font-medium', getChangeClass(quote.low - quote.prevClose)]">
          {{ quote.low.toFixed(2) }}
        </span>
      </div>
      <div>
        <span class="text-muted-foreground">昨收</span>
        <span class="ml-2 font-medium">{{ quote.prevClose.toFixed(2) }}</span>
      </div>
      <div>
        <span class="text-muted-foreground">成交量</span>
        <span class="ml-2 font-medium">{{ formatLargeNumber(quote.volume) }}</span>
      </div>
    </div>

    <!-- 市值和货币 -->
    <div class="flex items-center gap-6 text-sm text-muted-foreground">
      <span>市值 {{ formatLargeNumber(metrics.marketCap) }}</span>
      <span>货币 {{ info.currency }}</span>
    </div>
  </div>
</template>
