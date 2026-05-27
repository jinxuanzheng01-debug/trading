import { ref, readonly, computed } from 'vue'
import type { StockDetailResponse, KlineData } from '@/types/stock'
import { KLINE_PERIODS } from '@/types/stock'

export function useStockDetail() {
  const config = useRuntimeConfig()
  const { fetchWithAuth } = useAuth()

  const stockDetail = ref<StockDetailResponse | null>(null)
  const klineData = ref<KlineData[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const currentPeriod = ref<string>('3M')
  const currentInterval = ref<string>('1d')

  const isInWatchlist = ref(false)

  /**
   * 根据股票代码获取股票详情
   */
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

  /**
   * 获取股票的K线数据
   */
  async function fetchKlineData(symbol: string) {
    loading.value = true
    error.value = null

    try {
      const response = await fetchWithAuth<{ symbol: string; interval: string; period: string; data: KlineData[] }>(
        `${config.public.apiBase}/api/stock/${symbol}/kline?interval=${currentInterval.value}&period=${currentPeriod.value}`
      )
      klineData.value = response.data
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to fetch kline data'
      console.error('Failed to fetch kline data:', e)
    } finally {
      loading.value = false
    }
  }

  /**
   * 更改时间周期并重新获取K线数据
   */
  function setPeriod(period: string) {
    if (stockDetail.value && KLINE_PERIODS[period]) {
      currentPeriod.value = period
      fetchKlineData(stockDetail.value.info.symbol)
    }
  }

  /**
   * 更改间隔并重新获取K线数据
   */
  function setInterval(interval: string) {
    if (stockDetail.value) {
      currentInterval.value = interval
      fetchKlineData(stockDetail.value.info.symbol)
    }
  }

  /**
   * 刷新所有数据
   */
  async function refresh() {
    if (stockDetail.value) {
      await fetchStockDetail(stockDetail.value.info.symbol)
      await fetchKlineData(stockDetail.value.info.symbol)
    }
  }

  /**
   * 格式化大数字
   */
  function formatLargeNumber(value: number | undefined): string {
    if (value === undefined || value === null) return '-'
    if (value >= 1e12) return `${(value / 1e12).toFixed(2)}万亿`
    if (value >= 1e9) return `${(value / 1e9).toFixed(2)}十亿`
    if (value >= 1e6) return `${(value / 1e6).toFixed(2)}百万`
    if (value >= 1e3) return `${(value / 1e3).toFixed(2)}千`
    return value.toFixed(2)
  }

  /**
   * 格式化百分比
   */
  function formatPercent(value: number | undefined): string {
    if (value === undefined || value === null) return '-'
    return `${value.toFixed(2)}%`
  }

  /**
   * 获取涨跌颜色类（国内习惯：涨红跌绿）
   */
  function getChangeClass(value: number | undefined): string {
    if (!value) return ''
    if (value > 0) return 'text-red-500'
    if (value < 0) return 'text-green-500'
    return ''
  }

  /**
   * 获取涨跌图标
   */
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
    currentPeriod: readonly(currentPeriod),
    currentInterval: readonly(currentInterval),
    isInWatchlist: readonly(isInWatchlist),
    fetchStockDetail,
    fetchKlineData,
    setPeriod,
    setInterval,
    refresh,
    formatLargeNumber,
    formatPercent,
    getChangeClass,
    getChangeIcon,
  }
}
