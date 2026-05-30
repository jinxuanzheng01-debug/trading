import { Agent } from '@voltagent/core'
import { getQuoteTool, getKlineTool, getIndicatorsTool } from './tools'
import { QUICK_ANALYSIS_PROMPT } from './prompt'

export const quickAnalysisAgent = new Agent({
  name: 'quickAnalysisAgent',
  purpose: '快速投研分析',
  instructions: QUICK_ANALYSIS_PROMPT,
  model: 'openai/deepseek-chat',
  tools: [getQuoteTool, getKlineTool, getIndicatorsTool],
})
