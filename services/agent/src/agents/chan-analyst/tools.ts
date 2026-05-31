import { createTool } from '@voltagent/core'
import { z } from 'zod'
import { fetchTAEngine, fetchMarketData } from '../../shared/market-data'

export const getChanAnalysisTool = createTool({
  name: 'get_chan_analysis',
  description: '获取缠论结构分析：中枢(筹码密集区)、笔、线段。包含每笔的价格、时间、幅度。',
  parameters: z.object({
    symbol: z.string().describe('股票代码，如 AAPL, 000001'),
    period: z.string().default('1d').describe('分析级别: 1d(日线)'),
  }),
  execute: async ({ symbol, period }) =>
    fetchTAEngine(`/api/chan/analyze?symbol=${encodeURIComponent(symbol)}&period=${period}`),
})

export const getQuoteTool = createTool({
  name: 'get_quote',
  description: '获取股票当前实时价格，用于判断价格相对于中枢的位置',
  parameters: z.object({
    symbol: z.string().describe('股票代码'),
  }),
  execute: async ({ symbol }) =>
    fetchMarketData(`/api/quote?symbol=${encodeURIComponent(symbol)}`),
})
