import { Agent } from '@voltagent/core'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { getQuoteTool, getKlineTool, getIndicatorsTool } from './tools'
import { QUICK_ANALYSIS_PROMPT } from './prompt'

const deepseek = createOpenAICompatible({
  name: 'deepseek',
  baseURL: process.env.OPENAI_BASE_URL || 'https://api.deepseek.com/v1',
  apiKey: process.env.OPENAI_API_KEY || '',
})

export const quickAnalysisAgent = new Agent({
  name: 'quickAnalysisAgent',
  purpose: '快速投研分析',
  instructions: QUICK_ANALYSIS_PROMPT,
  model: deepseek.chatModel('deepseek-v4-pro'),
  tools: [getQuoteTool, getKlineTool, getIndicatorsTool],
})
