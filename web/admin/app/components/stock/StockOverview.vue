<script setup lang="ts">
import type { StockDetailResponse } from '@trading-agent/types'

interface Props {
  data: StockDetailResponse
}

const props = defineProps<Props>()

const { formatLargeNumber } = useStockDetail()

const metrics = computed(() => props.data.metrics)

const metricCards = computed(() => [
  { label: '市盈率 P/E', value: metrics.value.trailingPE, format: 'number' },
  { label: '市净率 P/B', value: metrics.value.priceToBook, format: 'number' },
  { label: '每股收益', value: metrics.value.eps, format: 'number' },
  { label: '52周高', value: metrics.value.fiftyTwoWeekHigh, format: 'price' },
  { label: '52周低', value: metrics.value.fiftyTwoWeekLow, format: 'price' },
  { label: '股息率', value: metrics.value.dividendYield, format: 'percent' },
  { label: 'Beta', value: metrics.value.beta, format: 'number' },
  { label: '流通股本', value: metrics.value.sharesOutstanding, format: 'large' },
])

function formatValue(value: number | undefined, format: string): string {
  if (value === undefined || value === null) return '-'

  switch (format) {
    case 'percent':
      return `${(value * 100).toFixed(2)}%`
    case 'price':
      return `$${value.toFixed(2)}`
    case 'large':
      return formatLargeNumber(value)
    default:
      return value.toFixed(2)
  }
}
</script>

<template>
  <div class="space-y-4">
    <h3 class="text-lg font-semibold">概览</h3>

    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <Card v-for="metric in metricCards" :key="metric.label">
        <CardContent class="pt-6">
          <p class="text-sm text-muted-foreground">{{ metric.label }}</p>
          <p class="text-2xl font-bold mt-1">{{ formatValue(metric.value, metric.format) }}</p>
        </CardContent>
      </Card>
    </div>

    <!-- 公司信息 -->
    <Card>
      <CardHeader>
        <CardTitle class="text-base">公司信息</CardTitle>
      </CardHeader>
      <CardContent>
        <div class="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          <div v-if="data.info.sector">
            <span class="text-muted-foreground">行业</span>
            <p class="font-medium mt-1">{{ data.info.sector }}</p>
          </div>
          <div v-if="data.info.industry">
            <span class="text-muted-foreground">细分行业</span>
            <p class="font-medium mt-1">{{ data.info.industry }}</p>
          </div>
          <div v-if="data.info.country">
            <span class="text-muted-foreground">国家</span>
            <p class="font-medium mt-1">{{ data.info.country }}</p>
          </div>
          <div v-if="data.info.website" class="md:col-span-2">
            <span class="text-muted-foreground">网站</span>
            <p class="font-medium mt-1">
              <a :href="data.info.website" target="_blank" rel="noopener" class="text-primary hover:underline">
                {{ data.info.website }}
              </a>
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  </div>
</template>
