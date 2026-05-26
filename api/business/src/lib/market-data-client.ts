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
  marketCap: number
  prevClose: number
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
    type: 'stock', // Default type since service doesn't provide it
    exchange: quote.currency === 'USD' ? 'US' : 'UNKNOWN', // Map currency to exchange
    price: quote.price,
    change: quote.change,
    changePercent: quote.changePercent,
    volume: quote.volume || 0,
    marketCap: quote.marketCap || 0,
    prevClose: quote.previousClose,
    dataDate: new Date(quote.timestamp), // Convert timestamp to Date
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
