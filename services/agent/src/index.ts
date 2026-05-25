import { Agent, VoltAgent } from '@voltagent/core'
import { createPinoLogger } from '@voltagent/logger'
import { honoServer } from '@voltagent/server-hono'
import { getQuoteTool, getKlineTool, getIndicatorsTool } from './tools/market-data'
import { QUICK_ANALYSIS_PROMPT } from './prompts'
import { startAnalysisWorker } from './worker'

const logger = createPinoLogger({
  name: 'trading-agent',
  level: 'info',
})

const quickAnalysisAgent = new Agent({
  name: 'quickAnalysisAgent',
  purpose: '快速投研分析',
  instructions: QUICK_ANALYSIS_PROMPT,
  model: 'openai/deepseek-chat',
  tools: [getQuoteTool, getKlineTool, getIndicatorsTool],
})

new VoltAgent({
  agents: { quickAnalysisAgent },
  logger,
  server: honoServer({
    port: 4001,
    basePath: '/agent',
  }),
})

if (process.env.START_WORKER !== 'false') {
  startAnalysisWorker()
  console.log('Analysis worker started')
}
