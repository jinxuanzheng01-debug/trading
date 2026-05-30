export interface BacktestConfig {
  strategyName: string
  strategyType: string
  ticker: string
  startDate: string
  endDate: string
  initialCapital: number
  feeModel: 'a_stock' | 'us_stock' | 'crypto'
  params?: Record<string, any>
}

export interface BacktestMetrics {
  totalReturn: number
  sharpe: number
  maxDrawdown: number
  winRate: number
  profitFactor: number
  tradeCount: number
}

export interface BacktestRun {
  id: number
  userId: number
  strategyName: string
  strategyCode: string
  strategyType: string
  config: BacktestConfig
  status: 'pending' | 'running' | 'completed' | 'failed'
  metrics?: BacktestMetrics
  equityCurve?: { date: string; value: number }[]
  trades?: any[]
  error?: string
  createdAt: string
  completedAt?: string
}
