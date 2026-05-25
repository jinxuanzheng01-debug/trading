export interface BacktestJobData {
  runId: string
  userId: number
  strategyCode: string
  strategyType: 'indicator' | 'script'
  config: {
    ticker: string
    market: string
    startDate: string
    endDate: string
    initialCapital: number
    feeModel: 'a_stock' | 'us_stock' | 'crypto'
  }
}
