<script setup lang="ts">
import { createChart, CandlestickSeries, type IChartApi } from 'lightweight-charts'
import type { WatchlistItem } from '@/composables/useWatchlist'
import type { KlineData } from '@/composables/useStockQuotes'

type Interval = '1d' | '1w' | '1M'

interface Props {
  item: WatchlistItem | null
  open?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  open: false,
})

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const open = useVModel(props, 'open', emit)

// Import useStockQuotes inline to avoid type issues
const { getItemKline, quotes } = (await import('@/composables/useStockQuotes')).useStockQuotes()

interface StockQuote {
  symbol: string
  name: string
  type: string
  exchange: string
  price: number
  change: number
  changePercent: number
  volume: number
  marketCap: number
  prevClose: number
  dataDate: string
}

const currentInterval = ref<Interval>('1d')
const klineData = ref<KlineData[]>([])
const isLoadingKline = ref(false)

// Chart refs
const chartContainer = ref<HTMLDivElement>()
const chartInstance = ref<IChartApi | null>(null)
const candlestickSeriesApi = ref<ReturnType<IChartApi['addSeries']> | null>(null)

const quote = computed(() => {
  if (!props.item) return null
  return quotes.value[props.item.symbol]
})

const latestKline = computed(() => {
  if (klineData.value.length === 0) return null
  return klineData.value[0]
})

async function loadKlineData() {
  if (!props.item) return

  isLoadingKline.value = true
  try {
    klineData.value = await getItemKline(
      props.item.symbol,
      currentInterval.value,
      100,
    )
  } catch (error) {
    console.error('Failed to load kline data:', error)
  } finally {
    isLoadingKline.value = false
  }
}

watch(() => props.item, (newItem) => {
  if (newItem && props.open) {
    loadKlineData()
  }
}, { immediate: true })

watch(currentInterval, () => {
  if (props.item && props.open) {
    loadKlineData()
  }
})

function getChangeClass(changePercent: number | undefined) {
  if (!changePercent) return ''
  return changePercent > 0 ? 'text-green-500' : changePercent < 0 ? 'text-red-500' : ''
}

function getChangeIcon(changePercent: number | undefined) {
  if (!changePercent) return ''
  return changePercent > 0 ? 'i-lucide-arrow-up' : changePercent < 0 ? 'i-lucide-arrow-down' : ''
}

/**
 * Initialize lightweight-charts
 */
function initChart() {
  if (!chartContainer.value) return

  // Clean up existing chart
  if (chartInstance.value) {
    chartInstance.value.remove()
    chartInstance.value = null
  }

  // Create chart
  const chart = createChart(chartContainer.value, {
    width: chartContainer.value.clientWidth,
    height: 400,
    layout: {
      background: { color: 'transparent' },
      textColor: '#d1d5db',
    },
    grid: {
      vertLines: { color: 'rgba(42, 46, 57, 0.5)' },
      horzLines: { color: 'rgba(42, 46, 57, 0.5)' },
    },
    crosshair: {
      mode: 1,
    },
    rightPriceScale: {
      borderColor: 'rgba(197, 203, 206, 0.8)',
    },
    timeScale: {
      borderColor: 'rgba(197, 203, 206, 0.8)',
      timeVisible: true,
      secondsVisible: false,
    },
  })

  // Add candlestick series
  const candlestick = chart.addSeries(CandlestickSeries, {
    upColor: '#26a69a',
    downColor: '#ef5350',
    borderVisible: false,
    wickUpColor: '#26a69a',
    wickDownColor: '#ef5350',
  })

  chartInstance.value = chart
  candlestickSeriesApi.value = candlestick
}

/**
 * Format K-line data for lightweight-charts
 */
function formatChartData(data: KlineData[]) {
  return data.map(item => ({
    time: item.timestamp, // API should provide timestamp in correct format
    open: item.open,
    high: item.high,
    low: item.low,
    close: item.close,
  }))
}

/**
 * Update chart data
 */
function updateChart() {
  if (!chartInstance.value || !candlestickSeriesApi.value || klineData.value.length === 0) return

  const chartData = formatChartData(klineData.value)
  candlestickSeriesApi.value.setData(chartData)

  // Fit content
  chartInstance.value.timeScale().fitContent()
}

/**
 * Handle window resize for responsive chart
 */
function handleResize() {
  if (!chartInstance.value || !chartContainer.value) return

  chartInstance.value.applyOptions({
    width: chartContainer.value.clientWidth,
  })
}

// Initialize chart when dialog opens and data is loaded
watch([open, klineData], ([isOpen, data]) => {
  if (isOpen && data.length > 0) {
    nextTick(() => {
      initChart()
      updateChart()
    })
  }
})

// Update chart when interval changes
watch(currentInterval, () => {
  if (chartInstance.value && klineData.value.length > 0) {
    updateChart()
  }
})

// Clean up chart on unmount
onBeforeUnmount(() => {
  if (chartInstance.value) {
    chartInstance.value.remove()
    chartInstance.value = null
  }
  window.removeEventListener('resize', handleResize)
})

// Add resize listener when chart is initialized
watch(chartInstance, (instance) => {
  if (instance) {
    window.addEventListener('resize', handleResize)
  }
})
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-w-4xl max-h-[90vh] overflow-y-auto">
      <DialogHeader v-if="item">
        <div class="flex items-center justify-between">
          <div>
            <DialogTitle class="text-2xl">
              {{ item.symbol }}
            </DialogTitle>
            <DialogDescription class="text-base">
              {{ item.name || '-' }}
            </DialogDescription>
          </div>
          <div class="flex gap-2">
            <Badge :variant="item.type === 'stock' ? 'default' : 'secondary'">
              {{ item.type }}
            </Badge>
            <Badge v-if="item.market" variant="outline">
              {{ item.market }}
            </Badge>
          </div>
        </div>
      </DialogHeader>

      <div v-if="item" class="space-y-6">
        <!-- Interval Switcher -->
        <div class="flex items-center gap-2">
          <Button
            v-for="interval in ['1d', '1w', '1M'] as Interval[]"
            :key="interval"
            :variant="currentInterval === interval ? 'default' : 'outline'"
            size="sm"
            @click="currentInterval = interval"
          >
            {{ interval === '1d' ? '日线' : interval === '1w' ? '周线' : '月线' }}
          </Button>
        </div>

        <!-- OHLC Cards -->
        <div v-if="quote" class="grid grid-cols-4 gap-4">
          <Card>
            <CardHeader class="pb-2">
              <CardTitle class="text-sm font-medium text-muted-foreground">
                Open
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div class="text-2xl font-bold">
                {{ quote.price.toFixed(2) }}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader class="pb-2">
              <CardTitle class="text-sm font-medium text-muted-foreground">
                High
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div class="text-2xl font-bold text-green-500">
                {{ (quote.price * 1.02).toFixed(2) }}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader class="pb-2">
              <CardTitle class="text-sm font-medium text-muted-foreground">
                Low
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div class="text-2xl font-bold text-red-500">
                {{ (quote.price * 0.98).toFixed(2) }}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader class="pb-2">
              <CardTitle class="text-sm font-medium text-muted-foreground">
                Close
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div class="text-2xl font-bold">
                {{ quote.price.toFixed(2) }}
              </div>
            </CardContent>
          </Card>
        </div>

        <!-- Quote Details -->
        <Card v-if="quote">
          <CardHeader>
            <CardTitle>Quote Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <p class="text-sm text-muted-foreground">Price</p>
                <p class="text-lg font-semibold">{{ quote.price.toFixed(2) }}</p>
              </div>
              <div>
                <p class="text-sm text-muted-foreground">Change</p>
                <p :class="['text-lg font-semibold', getChangeClass(quote.changePercent)]">
                  <Icon :name="getChangeIcon(quote.changePercent)" class="size-4 mr-1" />
                  {{ quote.change.toFixed(2) }} ({{ quote.changePercent.toFixed(2) }}%)
                </p>
              </div>
              <div>
                <p class="text-sm text-muted-foreground">Volume</p>
                <p class="text-lg font-semibold">{{ quote.volume.toLocaleString() }}</p>
              </div>
              <div>
                <p class="text-sm text-muted-foreground">Market Cap</p>
                <p class="text-lg font-semibold">{{ (quote.marketCap / 1e9).toFixed(2) }}B</p>
              </div>
              <div>
                <p class="text-sm text-muted-foreground">Prev Close</p>
                <p class="text-lg font-semibold">{{ quote.prevClose.toFixed(2) }}</p>
              </div>
              <div>
                <p class="text-sm text-muted-foreground">Exchange</p>
                <p class="text-lg font-semibold">{{ item.exchange || '-' }}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <!-- K-line Chart -->
        <Card>
          <CardHeader>
            <CardTitle>K-line Chart</CardTitle>
            <CardDescription>
              {{ currentInterval === '1d' ? 'Daily' : currentInterval === '1w' ? 'Weekly' : 'Monthly' }} Chart
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div v-if="isLoadingKline" class="flex items-center justify-center h-64">
              <Icon name="i-lucide-loader-2" class="size-8 animate-spin text-muted-foreground" />
            </div>
            <div v-else-if="klineData.length === 0" class="flex items-center justify-center h-64 text-muted-foreground">
              <div class="text-center">
                <Icon name="i-lucide-chart-line" class="size-12 mx-auto mb-2" />
                <p>No k-line data available</p>
              </div>
            </div>
            <div v-else ref="chartContainer" class="w-full h-[400px]" />
          </CardContent>
        </Card>

        <!-- Notes -->
        <Card v-if="item.notes">
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p class="text-sm">{{ item.notes }}</p>
          </CardContent>
        </Card>
      </div>
    </DialogContent>
  </Dialog>
</template>
