import { createTool } from '@voltagent/core'
import { z } from 'zod'
import { fetchMarketData, fetchBackendAPI } from '../../shared/market-data'

export const getQuoteTool = createTool({
  name: 'get_quote',
  description: '获取股票实时行情',
  parameters: z.object({
    symbol: z.string().describe('股票代码'),
  }),
  execute: async ({ symbol }) => fetchMarketData(`/api/quote?symbol=${encodeURIComponent(symbol)}`),
})

export const getKlineTool = createTool({
  name: 'get_kline',
  description: '获取K线数据（从数据库读取）',
  parameters: z.object({
    symbol: z.string().describe('股票代码'),
    interval: z.string().default('1d'),
    limit: z.number().default(100),
  }),
  execute: async ({ symbol, interval, limit }) =>
    fetchBackendAPI(`/api/stock/${encodeURIComponent(symbol)}/kline?interval=${interval}&limit=${limit}`),
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
    fetchMarketData(`/api/indicators?symbol=${encodeURIComponent(symbol)}&indicators=${indicators}&interval=${interval}&period=${period}`),
})
