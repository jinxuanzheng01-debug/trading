import { ref, readonly } from 'vue'
import type { StockDetailResponse, KlineData } from '@trading-agent/types'

export function useStockDetail() {
  const config = useRuntimeConfig()
  const { fetchWithAuth } = useAuth()

  const stockDetail = ref<StockDetailResponse | null>(null)
  const klineData = ref<KlineData[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const currentInterval = ref<string>('1d')
  const klineLimit = ref<number>(252)

  const isInWatchlist = ref(false)

  async function fetchStockDetail(symbol: string) {
    loading.value = true
    error.value = null

    try {
      const response = await fetchWithAuth<StockDetailResponse>(
        `${config.public.apiBase}/api/stock/${symbol}`
      )
      stockDetail.value = response
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to fetch stock detail'
      console.error('Failed to fetch stock detail:', e)
      throw e
    } finally {
      loading.value = false
    }
  }

  async function fetchKlineData(symbol: string, startDate?: string) {
    loading.value = true
    error.value = null

    try {
      let url = `${config.public.apiBase}/api/stock/${symbol}/kline?interval=${currentInterval.value}&limit=${klineLimit.value}`
      if (startDate) {
        url += `&start=${startDate}`
      }
      const response = await fetchWithAuth<{ symbol: string; interval: string; limit: number; data: KlineData[] }>(url)
      // merge: if loading more, append to existing data
      if (startDate && klineData.value.length > 0) {
        const existingTimestamps = new Set(klineData.value.map(d => d.timestamp))
        const newItems = response.data.filter(d => !existingTimestamps.has(d.timestamp))
        if (newItems.length === 0) return // 没有新数据，终止请求
        klineData.value = [...newItems, ...klineData.value].sort(
          (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        )
      } else {
        klineData.value = response.data
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to fetch kline data'
      console.error('Failed to fetch kline data:', e)
    } finally {
      loading.value = false
    }
  }

  function setInterval(interval: string) {
    if (stockDetail.value) {
      currentInterval.value = interval
      klineLimit.value = 252
      fetchKlineData(stockDetail.value.info.symbol)
    }
  }

  async function loadMoreKline(symbol: string) {
    if (loading.value || klineData.value.length === 0) return

    // 用 Unix 时间戳传最早日期，请求更早的 252 根
    const oldestTs = Math.floor(new Date(klineData.value[0].timestamp).getTime() / 1000)
    await fetchKlineData(symbol, String(oldestTs))
  }

  async function refresh() {
    if (stockDetail.value) {
      await fetchStockDetail(stockDetail.value.info.symbol)
      await fetchKlineData(stockDetail.value.info.symbol)
    }
  }

  function formatLargeNumber(value: number | undefined): string {
    if (value === undefined || value === null) return '-'
    if (value >= 1e12) return `${(value / 1e12).toFixed(2)}万亿`
    if (value >= 1e9) return `${(value / 1e9).toFixed(2)}十亿`
    if (value >= 1e6) return `${(value / 1e6).toFixed(2)}百万`
    if (value >= 1e3) return `${(value / 1e3).toFixed(2)}千`
    return value.toFixed(2)
  }

  function formatPercent(value: number | undefined): string {
    if (value === undefined || value === null) return '-'
    return `${value.toFixed(2)}%`
  }

  function getChangeClass(value: number | undefined): string {
    if (!value) return ''
    if (value > 0) return 'text-red-500'
    if (value < 0) return 'text-green-500'
    return ''
  }

  function getChangeIcon(value: number | undefined): string {
    if (!value) return ''
    if (value > 0) return 'i-lucide-trending-up'
    if (value < 0) return 'i-lucide-trending-down'
    return ''
  }

  return {
    stockDetail: readonly(stockDetail),
    klineData: readonly(klineData),
    loading: readonly(loading),
    error: readonly(error),
    currentInterval: readonly(currentInterval),
    klineLimit: readonly(klineLimit),
    isInWatchlist: readonly(isInWatchlist),
    fetchStockDetail,
    fetchKlineData,
    setInterval,
    loadMoreKline,
    refresh,
    formatLargeNumber,
    formatPercent,
    getChangeClass,
    getChangeIcon,
  }
}
