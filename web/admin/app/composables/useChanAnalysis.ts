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
  bi_list: BiInfo[]
  seg_list: SegInfo[]
  zs_list: ZSInfo[]
  bsp_list: BSPInfo[]
  divergence: { type: string; level: string; detail: string } | null
  summary: string
}

export interface ChanLLMResult {
  position: string
  zs_analysis: {
    level: string
    type: string
    count: number
    current_zs?: { high: number; low: number; zg: number; zd: number }
  }
  bsp_signals: Array<{ type: string; price?: number; significance: string }>
  divergence?: { type: string; implication: string }
  summary: string
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
    // 先拿到原始数据
    if (!result.value || result.value.symbol !== symbol) {
      await analyze(symbol, period)
    }
    if (!result.value) return

    llmLoading.value = true
    llmError.value = null

    // 精简数据发给 LLM，避免 token 浪费
    const { bi_list, seg_list, zs_list, bsp_list, divergence, summary } = result.value
    const briefData = {
      symbol,
      level: period,
      summary,
      zs_count: zs_list.length,
      zs_list: zs_list.map(z => ({
        type: z.type, zg: z.zg.toFixed(2), zd: z.zd.toFixed(2),
        start: z.start_time, end: z.end_time,
      })),
      bi_count: bi_list.length,
      recent_bi: bi_list.slice(-5).map(b => ({
        dir: b.direction, start: b.start_price.toFixed(2), end: b.end_price.toFixed(2),
        pct: `${b.strength > 0 ? '+' : ''}${b.strength.toFixed(1)}%`,
        from: b.start_time,
      })),
      seg_count: seg_list.length,
    }

    try {
      const res = await $fetch<{ text?: string; content?: string }>(
        '/api/agent/agents/chanAnalystAgent/generate',
        {
          method: 'POST',
          body: {
            messages: [{
              role: 'user',
              content: `请分析以下缠论结构数据，给出买卖点判断和操作建议：\n\`\`\`json\n${JSON.stringify(briefData, null, 2)}\n\`\`\``,
            }],
          },
        },
      )
      const text = res?.text || res?.content || ''
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        llmResult.value = JSON.parse(jsonMatch[0])
      }
      else {
        llmError.value = 'LLM 返回格式异常'
      }
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
