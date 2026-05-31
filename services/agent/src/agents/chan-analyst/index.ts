import { Agent } from '@voltagent/core'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { getChanAnalysisTool, getQuoteTool } from './tools'
import { CHAN_ANALYST_PROMPT } from './prompt'

const deepseek = createOpenAICompatible({
  name: 'deepseek',
  baseURL: process.env.OPENAI_BASE_URL || 'https://api.deepseek.com/v1',
  apiKey: process.env.OPENAI_API_KEY || '',
})

export const chanAnalystAgent = new Agent({
  name: 'chanAnalystAgent',
  purpose: '缠论技术分析',
  instructions: CHAN_ANALYST_PROMPT,
  model: deepseek.chatModel('deepseek-v4-pro'),
  tools: [getChanAnalysisTool, getQuoteTool],
})
