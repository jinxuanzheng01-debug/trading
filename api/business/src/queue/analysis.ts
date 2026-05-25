export interface AnalysisJobData {
  runId: string
  userId: number
  ticker: string
  market: 'a_stock' | 'hk' | 'us' | 'crypto'
  depth: 'quick' | 'standard' | 'deep'
}
