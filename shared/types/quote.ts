// K-line data (daily)
export interface KlineData {
  symbol: string
  timestamp: string
  open: number
  high: number
  low: number
  close: number
  volume: number
  amount?: number
  preClose?: number
  change?: number
  changePercent?: number
  turnoverRate?: number
  dataSource?: string
}

// Quote snapshot (historical price record)
export interface QuoteSnapshot {
  symbol: string
  price: number
  change: number
  changePercent: number
  volume: number
  timestamp: string
}

// K-line period type only — actual constants in backend lib/response.ts
