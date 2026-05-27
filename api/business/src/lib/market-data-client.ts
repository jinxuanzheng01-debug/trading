interface ServiceQuoteData {
  symbol: string
  name: string
  price: number
  change: number
  changePercent: number
  volume: number
  high: number
  low: number
  open: number
  previousClose: number
  marketCap: number | null
  currency: string
  timestamp: string
}

interface ServiceKlineData {
  time: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

interface MarketDataQuote {
  symbol: string
  name: string
  type: string
  exchange: string
  price: number
  change: number
  changePercent: number
  volume: number
  high: number
  low: number
  open: number
  marketCap: number
  prevClose: number
  currency: string
  dataDate: Date
}

interface KlineData {
  symbol: string
  interval: string
  open: number
  high: number
  low: number
  close: number
  volume: number
  timestamp: string
  dataDate: Date
}

interface ServiceStockInfo {
  symbol: string
  name: string
  sector?: string
  industry?: string
  website?: string
  country?: string
  currency: string
}

interface ServiceStockMetrics {
  marketCap: number
  trailingPE?: number
  forwardPE?: number
  priceToBook?: number
  beta?: number
  fiftyTwoWeekHigh?: number
  fiftyTwoWeekLow?: number
  dividendRate?: number
  dividendYield?: number
}

interface ServiceStockDetail {
  info: ServiceStockInfo
  quote: ServiceQuoteData
  metrics: ServiceStockMetrics
}

const MARKET_DATA_BASE = process.env.MARKET_DATA_API_BASE || 'http://localhost:8000'

export async function getQuotes(symbols: string[]): Promise<MarketDataQuote[]> {
  if (!symbols || symbols.length === 0) {
    return []
  }

  const url = `${MARKET_DATA_BASE}/api/quotes?symbols=${symbols.join(',')}`
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Market-data service error: ${response.statusText} (${url})`)
  }
  const responseData = await response.json() as { data: ServiceQuoteData[] }

  // Transform service response to expected format
  return responseData.data.map((quote): MarketDataQuote => ({
    symbol: quote.symbol,
    name: quote.name || quote.symbol,
    type: 'stock',
    exchange: quote.currency === 'USD' ? 'US' : 'UNKNOWN',
    price: quote.price,
    change: quote.change,
    changePercent: quote.changePercent,
    volume: quote.volume || 0,
    high: quote.high || 0,
    low: quote.low || 0,
    open: quote.open || 0,
    marketCap: quote.marketCap || 0,
    prevClose: quote.previousClose,
    currency: quote.currency || 'USD',
    dataDate: new Date(quote.timestamp),
  }))
}

export async function getKlines(
  symbol: string,
  interval: string,
  limit?: number
): Promise<KlineData[]> {
  const params = new URLSearchParams({
    symbol,
    interval,
    ...(limit && { limit: limit.toString() })
  })

  const url = `${MARKET_DATA_BASE}/api/kline?${params}`
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Market-data service error: ${response.statusText} (${url})`)
  }
  const responseData = await response.json() as { data: ServiceKlineData[] }

  // Transform service response to expected format
  return responseData.data.map((kline): KlineData => ({
    symbol,
    interval,
    open: kline.open,
    high: kline.high,
    low: kline.low,
    close: kline.close,
    volume: kline.volume,
    timestamp: kline.time,
    dataDate: new Date(kline.time),
  }))
}

export async function getStockDetail(symbol: string): Promise<{
  info: {
    symbol: string
    name: string
    sector?: string
    industry?: string
    website?: string
    country?: string
    currency: string
    exchange: string
    market: string
    type: string
  }
  quote: Omit<MarketDataQuote, 'dataDate'> & { dataDate: string }
  metrics: {
    marketCap: number
    trailingPE?: number
    forwardPE?: number
    priceToBook?: number
    beta?: number
    fiftyTwoWeekHigh?: number
    fiftyTwoWeekLow?: number
    dividendRate?: number
    dividendYield?: number
  }
}> {
  const url = `${MARKET_DATA_BASE}/api/stock/${symbol}`
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`Market-data service error: ${response.statusText} (${url})`)
  }

  const data = await response.json() as ServiceStockDetail

  // 根据货币确定交易所和市场
  const currency = data.info.currency || 'USD'
  let exchange = 'US'
  let market = 'US'

  if (currency === 'CNY') {
    exchange = 'SH'
    market = 'CN'
  } else if (currency === 'HKD') {
    exchange = 'HK'
    market = 'HK'
  }

  return {
    info: {
      symbol: data.info.symbol,
      name: data.info.name,
      sector: data.info.sector,
      industry: data.info.industry,
      website: data.info.website,
      country: data.info.country,
      currency: data.info.currency,
      exchange,
      market,
      type: 'stock',
    },
    quote: {
      symbol: data.quote.symbol,
      name: data.quote.name || data.info.name,
      type: 'stock',
      exchange,
      price: data.quote.price,
      change: data.quote.change,
      changePercent: data.quote.changePercent,
      volume: data.quote.volume || 0,
      high: data.quote.high || 0,
      low: data.quote.low || 0,
      open: data.quote.open || 0,
      marketCap: data.quote.marketCap || 0,
      prevClose: data.quote.previousClose,
      currency: data.quote.currency || currency,
      dataDate: new Date(data.quote.timestamp).toISOString(),
    },
    metrics: {
      marketCap: data.metrics.marketCap || 0,
      trailingPE: data.metrics.trailingPE,
      forwardPE: data.metrics.forwardPE,
      priceToBook: data.metrics.priceToBook,
      beta: data.metrics.beta,
      fiftyTwoWeekHigh: data.metrics.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: data.metrics.fiftyTwoWeekLow,
      dividendRate: data.metrics.dividendRate,
      dividendYield: data.metrics.dividendYield,
    },
  }
}

export async function getKlinesByPeriod(
  symbol: string,
  interval: string,
  period: string
): Promise<KlineData[]> {
  // 将周期映射到天数
  const periodDays: Record<string, number> = {
    '1d': 1,
    '1w': 7,
    '1M': 30,
    '3M': 90,
    '6M': 180,
    '1y': 365,
    '5y': 1825,
  }

  const days = periodDays[period] || 30
  const limit = days // 基于周期的近似限制

  return getKlines(symbol, interval, limit)
}
