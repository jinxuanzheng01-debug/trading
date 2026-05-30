// Stock fundamental info
export interface StockInfo {
  symbol: string
  name: string
  nameCn?: string
  exchange?: string
  market?: string
  type?: string
  sector?: string
  industry?: string
  website?: string
  country?: string
  listingDate?: string
  currency?: string
}

// Key metrics
export interface StockMetrics {
  marketCap?: number
  trailingPE?: number
  forwardPE?: number
  priceToBook?: number
  beta?: number
  fiftyTwoWeekHigh?: number
  fiftyTwoWeekLow?: number
  dividendRate?: number
  dividendYield?: number
  eps?: number
  sharesOutstanding?: number
}

// Real-time quote
export interface StockQuote {
  symbol: string
  name: string
  price: number
  change: number
  changePercent: number
  volume: number
  high: number
  low: number
  open: number
  prevClose: number
  marketCap: number
  currency: string
  dataDate: string
}

// Full stock detail response (info + quote + metrics)
export interface StockDetailResponse {
  info: StockInfo
  quote: StockQuote
  metrics: StockMetrics
}
