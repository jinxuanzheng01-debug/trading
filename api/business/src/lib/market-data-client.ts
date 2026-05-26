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
  dataDate: string
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
  dataDate: string
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
  const data = await response.json() as { quotes?: MarketDataQuote[] }
  return data.quotes || []
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
  const data = await response.json() as { data?: KlineData[] }
  return data.data || []
}
