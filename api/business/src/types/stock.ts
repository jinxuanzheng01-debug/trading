// 股票详情扩展类型
export interface StockInfo {
  symbol: string          // 股票代码
  name: string            // 股票名称
  nameCn?: string         // 中文名称
  sector?: string         // 行业
  industry?: string       // 细分行业
  website?: string        // 网站
  country?: string        // 国家
  currency: string        // 货币
  exchange: string        // 交易所
  market: string          // 市场
  type: string            // 类型
}

export interface StockMetrics {
  marketCap: number           // 市值
  trailingPE?: number         // 市盈率（TTM）
  forwardPE?: number          // 远期市盈率
  priceToBook?: number        // 市净率
  beta?: number               // Beta系数
  fiftyTwoWeekHigh?: number   // 52周最高
  fiftyTwoWeekLow?: number    // 52周最低
  dividendRate?: number       // 股息
  dividendYield?: number      // 股息率
  eps?: number                // 每股收益
  sharesOutstanding?: number  // 流通股本
}

export interface StockQuoteDetail {
  symbol: string
  name: string
  price: number               // 当前价格
  change: number              // 涨跌额
  changePercent: number       // 涨跌幅
  volume: number              // 成交量
  high: number                // 最高价
  low: number                 // 最低价
  open: number                // 开盘价
  prevClose: number           // 昨收价
  marketCap: number           // 市值
  currency: string            // 货币
  dataDate: string            // 数据日期
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
