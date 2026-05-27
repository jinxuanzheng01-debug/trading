// 股票详情扩展类型
export interface StockInfo {
  symbol: string
  name: string
  nameCn?: string
  sector?: string
  industry?: string
  website?: string
  country?: string
  currency: string
  exchange: string
  market: string
  type: string
}

export interface StockMetrics {
  marketCap: number
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

export interface StockQuoteDetail {
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

export interface StockDetailResponse {
  info: StockInfo
  quote: StockQuoteDetail
  metrics: StockMetrics
}

export interface KlinePeriod {
  value: string
  label: string
  days: number
}

export const KLINE_PERIODS: Record<string, KlinePeriod> = {
  '1d': { value: '1d', label: '1天', days: 1 },
  '1w': { value: '1w', label: '1周', days: 7 },
  '1M': { value: '1M', label: '1月', days: 30 },
  '3M': { value: '3M', label: '3月', days: 90 },
  '6M': { value: '6M', label: '6月', days: 180 },
  '1y': { value: '1y', label: '1年', days: 365 },
  '5y': { value: '5y', label: '5年', days: 1825 },
}

export interface KlineData {
  symbol: string
  interval: string
  open: number
  high: number
  low: number
  close: number
  volume: number
  timestamp: string
  dataDate: string
}
