const MARKET_DATA_BASE = process.env.MARKET_DATA_URL || 'http://market-data:8000'
const TA_ENGINE_BASE = process.env.TA_ENGINE_URL || 'http://ta-engine:8003'

export async function fetchMarketData(path: string) {
  const res = await fetch(`${MARKET_DATA_BASE}${path}`)
  if (!res.ok) throw new Error(`Market data error: ${res.status}`)
  return res.json()
}

export async function fetchTAEngine(path: string) {
  const res = await fetch(`${TA_ENGINE_BASE}${path}`)
  if (!res.ok) throw new Error(`TA engine error: ${res.status}`)
  return res.json()
}
