import { createTool } from '@voltagent/core'
import { z } from 'zod'

const MARKET_DATA_BASE = process.env.MARKET_DATA_URL || 'http://market-data:8000'

async function fetchData(path: string) {
  const res = await fetch(`${MARKET_DATA_BASE}${path}`)
  if (!res.ok) throw new Error(`Market data error: ${res.status}`)
  return res.json()
}

export const getQuoteTool = createTool({
  name: 'get_quote',
  description: '获取股票实时行情',
  parameters: z.object({
    symbol: z.string().describe('股票代码'),
  }),
  execute: async ({ symbol }) => fetchData(`/api/quote?symbol=${encodeURIComponent(symbol)}`),
})

export const getKlineTool = createTool({
  name: 'get_kline',
  description: '获取K线数据',
  parameters: z.object({
    symbol: z.string().describe('股票代码'),
    interval: z.string().default('1d'),
    limit: z.number().default(100),
  }),
  execute: async ({ symbol, interval, limit }) =>
    fetchData(`/api/kline?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=${limit}`),
})

export const getIndicatorsTool = createTool({
  name: 'get_indicators',
  description: '获取技术指标',
  parameters: z.object({
    symbol: z.string().describe('股票代码'),
    indicators: z.string().describe('逗号分隔指标名'),
    interval: z.string().default('1d'),
    period: z.number().default(100),
  }),
  execute: async ({ symbol, indicators, interval, period }) =>
    fetchData(`/api/indicators?symbol=${encodeURIComponent(symbol)}&indicators=${indicators}&interval=${interval}&period=${period}`),
})
