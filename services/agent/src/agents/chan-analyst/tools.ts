import { createTool } from '@voltagent/core'
import { z } from 'zod'
import { fetchTAEngine } from '../../shared/market-data'

export const getChanAnalysisTool = createTool({
  name: 'get_chan_analysis',
  description: '获取缠论分析结果：中枢(筹码密集区)、笔、线段、买卖点(一买/二买/三买)、背驰信号。这些是纯结构分析，不依赖传统技术指标。',
  parameters: z.object({
    symbol: z.string().describe('股票代码，如 AAPL, 000001'),
    period: z.string().default('1d').describe('分析级别: 1d(日线)'),
  }),
  execute: async ({ symbol, period }) =>
    fetchTAEngine(`/api/chan/analyze?symbol=${encodeURIComponent(symbol)}&period=${period}`),
})
