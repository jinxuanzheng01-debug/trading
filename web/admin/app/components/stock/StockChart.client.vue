<script setup lang="ts">
import type { KlineData } from '@trading-agent/types'

interface Props {
  symbol: string
  data: readonly any[]
  loading?: boolean
  hasMore?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  hasMore: true,
})

const emit = defineEmits<{
  'interval-change': [interval: string]
  'load-more': []
}>()

const currentInterval = ref<string>('1d')
const chartContainer = ref<HTMLDivElement>()
let chartInstance: any = null
let candlestickSeries: any = null
let volumeSeries: any = null
let isLoadingMore = false
let isInitializing = false
let initialRenderComplete = false
let isFirstUpdate = true

// K线周期选项
const intervals = [
  { value: '1d', label: '日K' },
  { value: '1w', label: '周K' },
  { value: '1M', label: '月K' },
]

async function initChart() {
  // 防止重复初始化和并发调用
  if (isInitializing) {
    console.log('StockChart: initialization already in progress, skipping')
    return
  }
  if (chartInstance) {
    console.log('StockChart: chart already initialized, updating data')
    updateChart()
    return
  }

  isInitializing = true

  // 如果容器还没准备好，等待 DOM 更新
  if (!chartContainer.value) {
    console.log('StockChart: initChart - container not ready, waiting...')
    await nextTick()
    if (!chartContainer.value) {
      console.log('StockChart: initChart - container still not ready, aborting')
      return
    }
  }

  console.log('StockChart: initChart called, props.data.length:', props.data.length)

  try {
    const { createChart, CandlestickSeries, HistogramSeries } = await import('lightweight-charts')
    console.log('StockChart: lightweight-charts imported')

    // 等待容器有实际尺寸
    await nextTick()
    const rect = chartContainer.value.getBoundingClientRect()
    const containerWidth = rect.width > 0 ? rect.width : 800
    const containerHeight = 400

    console.log('StockChart: creating chart with dimensions:', containerWidth, 'x', containerHeight)
    console.log('StockChart: container rect:', rect)

    const chart = createChart(chartContainer.value, {
      width: containerWidth,
      height: containerHeight,
      layout: {
        background: { color: '#ffffff' },
        textColor: '#333',
      },
      grid: {
        vertLines: { color: '#e1e1e1' },
        horzLines: { color: '#e1e1e1' },
      },
      crosshair: {
        mode: 1,
      },
      rightPriceScale: {
        borderColor: '#d1d5db',
      },
      timeScale: {
        borderColor: '#d1d5db',
        timeVisible: true,
        secondsVisible: false,
      },
    })

    console.log('StockChart: chart created successfully')

    candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#ef5350',
      downColor: '#26a69a',
      borderVisible: false,
      wickUpColor: '#ef5350',
      wickDownColor: '#26a69a',
    })

    volumeSeries = chart.addSeries(HistogramSeries, {
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

    console.log('StockChart: series created, now setting chart instance')

    console.log('StockChart: series created, calling updateChart')

    // Set chart instance only after series are created
    chartInstance = chart
    console.log('StockChart: chart instance and series ready, updateChart can now proceed')

    // 检查容器和 canvas 状态
    nextTick(() => {
      if (chartContainer.value) {
        const container = chartContainer.value
        const canvas = container.querySelector('canvas')
        const rect = container.getBoundingClientRect()

        console.log('StockChart: Container state:', {
          exists: true,
          visible: rect.width > 0 && rect.height > 0,
          rect: { width: rect.width, height: rect.height, top: rect.top, left: rect.left },
          display: window.getComputedStyle(container).display,
          canvas: {
            exists: !!canvas,
            width: canvas?.width,
            height: canvas?.height,
            rect: canvas ? { width: canvas.getBoundingClientRect().width, height: canvas.getBoundingClientRect().height } : null
          }
        })
      }
    })

    // 监听可见范围变化：只有可视范围超出已加载数据边界才拉新数据
    chart.timeScale().subscribeVisibleLogicalRangeChange((logicalRange: any) => {
      if (!logicalRange || !props.data.length || isLoadingMore || !props.hasMore) return
      if (!initialRenderComplete) return

      // convert logical bar indices to Unix timestamps
      const ts = chart.timeScale()
      const viewFrom = Math.floor((ts.coordinateToTime(logicalRange.from) as number) ?? 0)
      const viewTo = Math.floor((ts.coordinateToTime(logicalRange.to) as number) ?? 0)
      const dataFrom = Math.floor(new Date(props.data[0].timestamp).getTime() / 1000)
      const dataTo = Math.floor(new Date(props.data[props.data.length - 1].timestamp).getTime() / 1000)

      if (viewFrom < dataFrom) {
        loadMoreData('before')
      } else if (viewTo > dataTo) {
        loadMoreData('after')
      }
    })

    updateChart()
  } catch (error) {
    console.error('StockChart: initChart error:', error)
  } finally {
    isInitializing = false
  }
}

function formatCandlestickData(data: readonly any[]) {
  console.log('StockChart: formatCandlestickData input:', {
    length: data.length,
    firstItem: data[0],
  })

  const formatted = data.map(item => {
    // 使用 Unix 时间戳（秒级）数字格式
    const date = new Date(item.timestamp)
    const time = Math.floor(date.getTime() / 1000) // Unix 时间戳秒
    return {
      time,
      open: item.open,
      high: item.high,
      low: item.low,
      close: item.close,
    }
  })

  console.log('StockChart: formatCandlestickData output:', {
    length: formatted.length,
    firstItem: formatted[0],
    lastItem: formatted[formatted.length - 1],
  })

  return formatted
}

function formatVolumeData(data: readonly any[]) {
  return data.map(item => {
    const date = new Date(item.timestamp)
    const time = Math.floor(date.getTime() / 1000) // Unix 时间戳秒
    return {
      time,
      value: item.volume,
      color: item.close >= item.open ? '#ef535080' : '#26a69a80',
    }
  })
}

function updateChart() {
  console.log('StockChart: updateChart called, data.length:', props.data.length)

  if (!chartInstance || !candlestickSeries || !volumeSeries) {
    console.log('StockChart: updateChart - chart not ready')
    return
  }
  if (props.data.length === 0) {
    console.log('StockChart: updateChart - no data')
    return
  }

  const candlestickData = formatCandlestickData(props.data)
  const volumeData = formatVolumeData(props.data)

  console.log('StockChart: setting data, candlestick:', candlestickData.length, 'volume:', volumeData.length)
  console.log('StockChart: first data point:', candlestickData[0])

  candlestickSeries.setData(candlestickData)
  volumeSeries.setData(volumeData)

  // Only fitContent on first render; subsequent updates keep current zoom
  if (isFirstUpdate) {
    isFirstUpdate = false
    initialRenderComplete = false
    chartInstance.timeScale().fitContent()
    setTimeout(() => { initialRenderComplete = true }, 500)
  }
  console.log('StockChart: chart data updated')
}

function loadMoreData(direction: 'before' | 'after') {
  if (!initialRenderComplete || isLoadingMore || !props.hasMore) return
  isLoadingMore = true
  emit('load-more')

  // 重置加载状态（父组件更新数据后会自动更新图表）
  setTimeout(() => {
    isLoadingMore = false
  }, 1000)
}

function handleIntervalChange(interval: string) {
  currentInterval.value = interval
  emit('interval-change', interval)
}

function handleResize() {
  if (!chartInstance || !chartContainer.value) return
  chartInstance.applyOptions({
    width: chartContainer.value.clientWidth,
  })
}

// 只在客户端挂载后初始化
onMounted(() => {
  window.addEventListener('resize', handleResize)

  console.log('StockChart: onMounted', {
    hasData: !!props.data,
    dataLength: props.data?.length,
    firstItem: props.data?.[0],
  })

  // 如果数据已存在，初始化图表
  if (props.data && props.data.length > 0) {
    nextTick(() => {
      console.log('StockChart: calling initChart from onMounted')
      initChart()
    })
  }
})

// 监听数据变化
watch(() => props.data, (newData) => {
  console.log('StockChart: data changed', {
    length: newData?.length,
    firstItem: newData?.[0],
  })
  if (newData && newData.length > 0) {
    if (!chartInstance) {
      console.log('StockChart: calling initChart from watch')
      initChart()
    } else {
      console.log('StockChart: calling updateChart from watch')
      updateChart()
    }
  }
}, { immediate: false })

// 监听 loading 状态变化：当 loading 变为 false 且图表未初始化时，重新尝试初始化
watch(() => props.loading, (newLoading) => {
  console.log('StockChart: loading changed to', newLoading)
  if (!newLoading && props.data.length > 0 && !chartInstance) {
    console.log('StockChart: calling initChart from loading watch')
    nextTick(() => {
      initChart()
    })
  }
})

onBeforeUnmount(() => {
  if (chartInstance) {
    chartInstance.remove()
    chartInstance = null
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
          <span class="text-sm text-muted-foreground">周期:</span>
          <Button
            v-for="interval in intervals"
            :key="interval.value"
            :variant="currentInterval === interval.value ? 'default' : 'outline'"
            size="sm"
            @click="handleIntervalChange(interval.value)"
          >
            {{ interval.label }}
          </Button>
        </div>
      </div>
    </CardHeader>
    <CardContent>
      <!-- 无数据状态 -->
      <div v-if="data.length === 0" class="flex items-center justify-center h-[400px] text-muted-foreground">
        <div class="text-center">
          <Icon name="i-lucide-chart-line" class="size-12 mx-auto mb-2" />
          <p>暂无K线数据</p>
        </div>
      </div>
      <!-- 图表容器始终保留，避免 loading 切换时 canvas 被移除 -->
      <div v-else class="relative w-full h-[400px] border border-dashed border-gray-300" style="min-width: 300px; min-height: 400px;">
        <div ref="chartContainer" class="w-full h-full" />
        <div v-if="loading" class="absolute inset-0 flex items-center justify-center bg-white/70">
          <Icon name="i-lucide-loader-2" class="size-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    </CardContent>
  </Card>
</template>
