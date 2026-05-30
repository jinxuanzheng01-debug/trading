import { Agent } from '@voltagent/core'
import { getChanAnalysisTool } from './tools'
import { CHAN_ANALYST_PROMPT } from './prompt'

export const chanAnalystAgent = new Agent({
  name: 'chanAnalystAgent',
  purpose: '缠论技术分析',
  instructions: CHAN_ANALYST_PROMPT,
  model: 'openai/deepseek-chat',
  tools: [getChanAnalysisTool],
})
