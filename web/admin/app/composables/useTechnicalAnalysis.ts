export interface TechnicalAnalysisResult {
  symbol: string
  overall_score: number
  signal: 'BUY' | 'HOLD' | 'SELL'
  confidence: number
  dimensions: Record<string, DimensionScore>
  active_signals: ActiveSignal[]
  factors: Record<string, number | null>
  indicators: Record<string, number | null>
}

export interface DimensionScore {
  score: number
  signal: 'BUY' | 'HOLD' | 'SELL'
  confidence: number
  active_signals: ActiveSignal[]
}

export interface ActiveSignal {
  name: string
  direction: 'long' | 'short' | 'neutral'
  strength: number
  factor_value: number | null
}

export function useTechnicalAnalysis() {
  // 走 Nuxt server proxy: /api/ta/* → ta-engine:8003/api/*
  const baseUrl = '/api/ta'

  const result = ref<TechnicalAnalysisResult | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function analyze(symbol: string, period = '1d') {
    loading.value = true
    error.value = null
    result.value = null

    try {
      const response = await $fetch<TechnicalAnalysisResult>(`${baseUrl}/analyze`, {
        method: 'POST',
        body: { symbol, period },
      })
      result.value = response
    }
    catch (e: any) {
      error.value = e?.data?.detail || e?.message || '技术分析请求失败'
      console.error('Technical analysis failed:', e)
    }
    finally {
      loading.value = false
    }
  }

  function getSignalColor(signal: string): string {
    switch (signal) {
      case 'BUY': return 'text-green-500'
      case 'SELL': return 'text-red-500'
      default: return 'text-yellow-500'
    }
  }

  function getSignalBg(signal: string): string {
    switch (signal) {
      case 'BUY': return 'bg-green-500/10 text-green-600 border-green-500/20'
      case 'SELL': return 'bg-red-500/10 text-red-600 border-red-500/20'
      default: return 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20'
    }
  }

  function getSignalLabel(signal: string): string {
    switch (signal) {
      case 'BUY': return '看多'
      case 'SELL': return '看空'
      default: return '观望'
    }
  }

  function getDimensionLabel(key: string): string {
    const labels: Record<string, string> = {
      trend: '趋势跟踪',
      momentum: '动量反转',
      volume: '量价分析',
      pattern: '形态识别',
    }
    return labels[key] || key
  }

  function getDimensionIcon(key: string): string {
    const icons: Record<string, string> = {
      trend: 'i-lucide-trending-up',
      momentum: 'i-lucide-activity',
      volume: 'i-lucide-bar-chart-3',
      pattern: 'i-lucide-candlestick-chart',
    }
    return icons[key] || 'i-lucide-circle'
  }

  function getDirectionLabel(dir: string): string {
    switch (dir) {
      case 'long': return '多'
      case 'short': return '空'
      default: return '中性'
    }
  }

  function getDirectionColor(dir: string): string {
    switch (dir) {
      case 'long': return 'text-green-500 bg-green-500/10'
      case 'short': return 'text-red-500 bg-red-500/10'
      default: return 'text-yellow-500 bg-yellow-500/10'
    }
  }

  return {
    result: readonly(result),
    loading: readonly(loading),
    error: readonly(error),
    analyze,
    getSignalColor,
    getSignalBg,
    getSignalLabel,
    getDimensionLabel,
    getDimensionIcon,
    getDirectionLabel,
    getDirectionColor,
  }
}
