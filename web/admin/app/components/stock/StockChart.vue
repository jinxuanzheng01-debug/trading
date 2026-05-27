<script setup lang="ts">
import type { KlineData } from '@/types/stock'
import { KLINE_PERIODS } from '@/types/stock'

interface Props {
  symbol: string
  data: KlineData[]
  loading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
})

const emit = defineEmits<{
  'period-change': [period: string]
}>()

const currentPeriod = ref<string>('3M')
const chartContainer = ref<HTMLDivElement>()
const chartInstance = ref<any>(null)
const candlestickSeries = ref<any>(null)
const volumeSeries = ref<any>(null)

const periods = computed(() => Object.values(KLINE_PERIODS))

function initChart() {
  if (!chartContainer.value) return

  if (chartInstance.value) {
    chartInstance.value.remove()
  }

  // 动态导入 lightweight-charts
  import('lightweight-charts').then(({ createChart, CandlestickSeries, VolumeSeries }) => {
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

    const candlestick = chart.addSeries(CandlestickSeries, {
      upColor: '#ef5350',
      downColor: '#26a69a',
      borderVisible: false,
      wickUpColor: '#ef5350',
      wickDownColor: '#26a69a',
    })

    const volume = chart.addSeries(VolumeSeries, {
      color: '#26a69a',
      priceFormat: {
        type: 'volume',
      },
      priceScaleId: '',
    })

    chart.priceScale('').applyOptions({
      scaleMargins: {
        top: 0.8,
        bottom: 0,
      },
    })

    chartInstance.value = chart
    candlestickSeries.value = candlestick
    volumeSeries.value = volume

    updateChart()
  })
}

function formatCandlestickData(data: KlineData[]) {
  return data.map(item => ({
    time: item.timestamp,
    open: item.open,
    high: item.high,
    low: item.low,
    close: item.close,
  }))
}

function formatVolumeData(data: KlineData[]) {
  return data.map(item => ({
    time: item.timestamp,
    value: item.volume,
    color: item.close >= item.open ? '#ef535080' : '#26a69a80',
  }))
}

function updateChart() {
  if (!chartInstance.value || !candlestickSeries.value || !volumeSeries.value) return
  if (props.data.length === 0) return

  const candlestickData = formatCandlestickData(props.data)
  const volumeData = formatVolumeData(props.data)

  candlestickSeries.value.setData(candlestickData)
  volumeSeries.value.setData(volumeData)

  chartInstance.value.timeScale().fitContent()
}

function handlePeriodChange(period: string) {
  currentPeriod.value = period
  emit('period-change', period)
}

function handleResize() {
  if (!chartInstance.value || !chartContainer.value) return
  chartInstance.value.applyOptions({
    width: chartContainer.value.clientWidth,
  })
}

watch(() => props.data, () => {
  if (props.data.length > 0) {
    nextTick(() => {
      if (!chartInstance.value) {
        initChart()
      } else {
        updateChart()
      }
    })
  }
}, { immediate: true })

watch(chartInstance, (instance) => {
  if (instance) {
    window.addEventListener('resize', handleResize)
  }
})

onBeforeUnmount(() => {
  if (chartInstance.value) {
    chartInstance.value.remove()
  }
  window.removeEventListener('resize', handleResize)
})
</script>

<template>
  <Card>
    <CardHeader>
      <div class="flex items-center justify-between">
        <CardTitle>K线图</CardTitle>
        <div class="flex items-center gap-2">
          <Button
            v-for="period in periods"
            :key="period.value"
            :variant="currentPeriod === period.value ? 'default' : 'outline'"
            size="sm"
            @click="handlePeriodChange(period.value)"
          >
            {{ period.label }}
          </Button>
        </div>
      </div>
    </CardHeader>
    <CardContent>
      <div v-if="loading" class="flex items-center justify-center h-[400px]">
        <Icon name="i-lucide-loader-2" class="size-8 animate-spin text-muted-foreground" />
      </div>
      <div v-else-if="data.length === 0" class="flex items-center justify-center h-[400px] text-muted-foreground">
        <div class="text-center">
          <Icon name="i-lucide-chart-line" class="size-12 mx-auto mb-2" />
          <p>暂无K线数据</p>
        </div>
      </div>
      <div v-else ref="chartContainer" class="w-full h-[400px]" />
    </CardContent>
  </Card>
</template>
