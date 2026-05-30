export type AnalysisStatus = 'pending' | 'processing' | 'completed' | 'failed'

export interface AnalysisResult {
  summary: string
  sentiment: 'bullish' | 'bearish' | 'neutral'
  confidence: number
  keyPoints: string[]
  riskLevel: 'low' | 'medium' | 'high'
}

export interface AnalysisRun {
  id: number
  userId: number
  ticker: string
  market: string
  depth: string
  status: AnalysisStatus
  result?: AnalysisResult
  layerOutputs?: Record<string, any>
  llmProvider?: string
  createdAt: string
  completedAt?: string
}
