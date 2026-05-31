export interface BiInfo {
  direction: string
  start_time: string
  end_time: string
  start_price: number
  end_price: number
  strength: number
}

export interface SegInfo {
  direction: string
  start_time: string
  end_time: string
  start_price: number
  end_price: number
  bi_count: number
}

export interface ZSInfo {
  type: string
  level: string
  high: number
  low: number
  zg: number
  zd: number
  start_time: string
  end_time: string
}

export interface BSPInfo {
  type: string
  price: number
  time: string
  confidence: number
}

export interface ChanResult {
  symbol: string
  level: string
  kline_from: string
  kline_to: string
  last_close: number
  bi_list: BiInfo[]
  seg_list: SegInfo[]
  zs_list: ZSInfo[]
  bsp_list: BSPInfo[]
  divergence: { type: string; level: string; detail: string } | null
  summary: string
}

export interface ChanLLMResult {
  plain_text: string
  chan_structure: { zs_type: string; zs_range: string; current_position: string; last_bi: string }
  signals: Array<{ type: string; meaning: string }>
  suggestion: string
}

export function useChanAnalysis() {
  const result = ref<ChanResult | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  // LLM 分析
  const llmResult = ref<ChanLLMResult | null>(null)
  const llmLoading = ref(false)
  const llmError = ref<string | null>(null)

  async function analyze(symbol: string, period = '1d') {
    loading.value = true
    error.value = null
    try {
      const data = await $fetch<ChanResult>(
        `/api/ta/chan/analyze?symbol=${encodeURIComponent(symbol)}&period=${period}`,
      )
      result.value = data
    }
    catch (e: any) {
      error.value = e?.data?.detail || e?.message || '缠论分析失败'
    }
    finally {
      loading.value = false
    }
  }

  async function analyzeWithLLM(symbol: string, period = '1d') {
    llmLoading.value = true
    llmError.value = null

    try {
      llmResult.value = await $fetch<ChanLLMResult>(
        '/api/chan/llm',
        {
          method: 'POST',
          body: { symbol, period },
          timeout: 120000,
        },
      )
    }
    catch (e: any) {
      llmError.value = e?.message || 'LLM 分析请求失败'
    }
    finally {
      llmLoading.value = false
    }
  }

  return { result, loading, error, analyze, llmResult, llmLoading, llmError, analyzeWithLLM }
}
