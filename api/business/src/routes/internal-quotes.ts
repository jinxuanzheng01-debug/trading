import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db'
import { sql } from 'drizzle-orm'
import { serviceTokenAuth } from '../middleware/service-token'

const MARKET_DATA_BASE = process.env.MARKET_DATA_API_BASE || 'http://market-data:8000'

const internalQuotes = new Hono()

// All internal endpoints require service token
internalQuotes.use('*', serviceTokenAuth)

// POST /api/internal/klines/sync - 同步日线K线数据到 klines 表（scheduler 调用）
const klineSyncSchema = z.object({
  symbol: z.string(),
  data: z.array(z.object({
    time: z.string(),
    open: z.number(),
    high: z.number(),
    low: z.number(),
    close: z.number(),
    volume: z.number(),
  })),
})

internalQuotes.post('/klines/sync', zValidator('json', klineSyncSchema), async (c) => {
  const { symbol, data } = c.req.valid('json')

  // Ensure stock exists
  await db.execute(sql`
    INSERT INTO stocks (symbol, name) VALUES (${symbol}, ${symbol})
    ON CONFLICT (symbol) DO NOTHING
  `)

  let count = 0
  for (const k of data) {
    try {
      await db.execute(sql`
        INSERT INTO klines (stock_id, timestamp, open, high, low, close, volume, data_source)
        SELECT s.id, ${new Date(k.time).toISOString().split('T')[0]}::date,
          ${String(k.open)}::numeric, ${String(k.high)}::numeric,
          ${String(k.low)}::numeric, ${String(k.close)}::numeric,
          ${k.volume}::bigint, 'yfinance'
        FROM stocks s WHERE s.symbol = ${symbol}
        ON CONFLICT (stock_id, timestamp) DO NOTHING
      `)
      count++
    } catch (err: any) {
      if (!err.message?.includes('duplicate key') && !err.message?.includes('unique constraint')) {
        console.error(`Failed to insert kline for ${symbol}:`, err)
      }
    }
  }

  return c.json({ success: true, count })
})

// GET /api/internal/klines/latest?symbol=AAPL - 查询最新K线日期
internalQuotes.get('/klines/latest', async (c) => {
  const symbol = c.req.query('symbol')

  const rows = await db.execute(sql`
    SELECT MAX(k.timestamp) as latest
    FROM klines k
    JOIN stocks s ON k.stock_id = s.id
    WHERE s.symbol = ${symbol}
  `) as any[]

  const latest = rows?.[0]?.latest || null
  return c.json({ symbol, latest_at: latest ? new Date(latest).toISOString() : null })
})

// GET /api/internal/stocks/symbols - 获取所有股票代码（scheduler 用）
internalQuotes.get('/stocks/symbols', async (c) => {
  const rows = await db.execute(sql`SELECT symbol FROM stocks ORDER BY symbol`) as any[]
  return c.json({ symbols: rows.map((r: any) => r.symbol) })
})

// POST /api/internal/fundamentals/sync - 同步基本面数据（scheduler 用）
internalQuotes.post('/fundamentals/sync', serviceTokenAuth, async (c) => {
  const body = await c.req.json()
  const symbols: string[] = body.symbols || []
  if (!symbols.length) return c.json({ success: false, error: 'no symbols' })

  // 从 market-data 服务的 /api/stock/:symbol 拉取基本面
  const results: Record<string, any> = {}
  for (const sym of symbols) {
    try {
      const resp = await fetch(`${MARKET_DATA_BASE}/api/stock/${sym}`)
      if (!resp.ok) { results[sym] = { error: 'fetch failed' }; continue }
      const detail = await resp.json() as any
      const info = detail.info || {}
      const metrics = detail.metrics || {}

      await db.execute(sql`INSERT INTO stocks (symbol, name, exchange, market, type, sector, industry)
        VALUES (${sym}, ${info.name || sym}, 'US', 'US', 'stock', ${info.sector || null}, ${info.industry || null})
        ON CONFLICT (symbol) DO UPDATE SET sector=EXCLUDED.sector, industry=EXCLUDED.industry, updated_at=NOW()`)

      await db.execute(sql`
        INSERT INTO stock_fundamentals (stock_id, market_cap, trailing_pe, forward_pe, price_to_book, beta,
          fifty_two_week_high, fifty_two_week_low, dividend_yield, eps, shares_outstanding, updated_at)
        SELECT s.id, ${metrics.marketCap ? String(metrics.marketCap) : null}::bigint,
          ${metrics.trailingPE ? String(metrics.trailingPE) : null}::numeric,
          ${metrics.forwardPE ? String(metrics.forwardPE) : null}::numeric,
          ${metrics.priceToBook ? String(metrics.priceToBook) : null}::numeric,
          ${metrics.beta ? String(metrics.beta) : null}::numeric,
          ${metrics.fiftyTwoWeekHigh ? String(metrics.fiftyTwoWeekHigh) : null}::numeric,
          ${metrics.fiftyTwoWeekLow ? String(metrics.fiftyTwoWeekLow) : null}::numeric,
          ${metrics.dividendYield ? String(metrics.dividendYield) : null}::numeric,
          ${metrics.eps ? String(metrics.eps) : null}::numeric,
          ${metrics.sharesOutstanding ? String(metrics.sharesOutstanding) : null}::bigint,
          NOW()
        FROM stocks s WHERE s.symbol = ${sym}
        ON CONFLICT (stock_id) DO UPDATE SET market_cap=EXCLUDED.market_cap, trailing_pe=EXCLUDED.trailing_pe,
          forward_pe=EXCLUDED.forward_pe, price_to_book=EXCLUDED.price_to_book, beta=EXCLUDED.beta,
          fifty_two_week_high=EXCLUDED.fifty_two_week_high, fifty_two_week_low=EXCLUDED.fifty_two_week_low,
          dividend_yield=EXCLUDED.dividend_yield, eps=EXCLUDED.eps,
          shares_outstanding=EXCLUDED.shares_outstanding, updated_at=NOW()
      `)
      results[sym] = { success: true }
    } catch (e: any) {
      results[sym] = { error: e.message }
    }
  }
  return c.json({ success: true, results })
})

// POST /api/internal/quotes/sync - 同步报价快照（scheduler 调用）
const quotesSyncSchema = z.object({
  quotes: z.array(z.object({
    symbol: z.string(),
    price: z.number(),
    change: z.number().optional(),
    changePercent: z.number().optional(),
    open: z.number().optional(),
    high: z.number().optional(),
    low: z.number().optional(),
    volume: z.number().optional(),
    prevClose: z.number().optional(),
    marketCap: z.number().optional(),
    currency: z.string().optional(),
  })),
})

internalQuotes.post('/quotes/sync', serviceTokenAuth, zValidator('json', quotesSyncSchema), async (c) => {
  const { quotes } = c.req.valid('json')
  let count = 0
  for (const q of quotes) {
    await db.execute(sql`INSERT INTO stocks (symbol, name) VALUES (${q.symbol}, ${q.symbol}) ON CONFLICT (symbol) DO NOTHING`)
    // UPSERT stock_quotes
    await db.execute(sql`
      INSERT INTO stock_quotes (stock_id, price, change, change_percent, open, high, low, volume, prev_close, market_cap, currency, timestamp, data_date, updated_at)
      SELECT s.id, ${String(q.price)}::numeric, ${String(q.change || 0)}::numeric, ${String(q.changePercent || 0)}::numeric,
        ${String(q.open || q.price)}::numeric, ${String(q.high || q.price)}::numeric, ${String(q.low || q.price)}::numeric,
        ${q.volume || 0}::bigint, ${String(q.prevClose || q.price)}::numeric, ${q.marketCap || 0}::bigint,
        ${q.currency || 'USD'}, NOW(), NOW(), NOW()
      FROM stocks s WHERE s.symbol = ${q.symbol}
      ON CONFLICT (stock_id) DO UPDATE SET
        price=EXCLUDED.price, change=EXCLUDED.change, change_percent=EXCLUDED.change_percent,
        open=EXCLUDED.open, high=EXCLUDED.high, low=EXCLUDED.low, volume=EXCLUDED.volume,
        prev_close=EXCLUDED.prev_close, market_cap=EXCLUDED.market_cap, timestamp=NOW(), data_date=NOW(), updated_at=NOW()
    `)
    // Append quote_snapshots (history)
    await db.execute(sql`
      INSERT INTO quote_snapshots (stock_id, price, change, change_percent, volume, timestamp)
      SELECT s.id, ${String(q.price)}::numeric, ${String(q.change || 0)}::numeric,
        ${String(q.changePercent || 0)}::numeric, ${q.volume || 0}::bigint, NOW()
      FROM stocks s WHERE s.symbol = ${q.symbol}
    `)
    count++
  }
  return c.json({ success: true, count })
})

export { internalQuotes }
