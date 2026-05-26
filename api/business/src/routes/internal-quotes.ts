import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db'
import { sql } from 'drizzle-orm'

const internalQuotes = new Hono()

// POST /api/internal/klines/sync - 同步K线数据到 stock_quote_history（scheduler 调用）
const klineSyncSchema = z.object({
  symbol: z.string(),
  interval: z.string(),
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
  const { symbol, interval, data } = c.req.valid('json')

  // Ensure stock exists
  await db.execute(sql`
    INSERT INTO stocks (symbol, name) VALUES (${symbol}, ${symbol})
    ON CONFLICT (symbol) DO NOTHING
  `)

  let count = 0
  for (const k of data) {
    try {
      await db.execute(sql`
        INSERT INTO stock_quote_history (stock_id, interval, open, high, low, close, volume, timestamp)
        SELECT s.id, ${interval}, ${String(k.open)}::numeric, ${String(k.high)}::numeric,
          ${String(k.low)}::numeric, ${String(k.close)}::numeric,
          ${k.volume}::bigint, ${new Date(k.time).toISOString()}::timestamp
        FROM stocks s WHERE s.symbol = ${symbol}
        ON CONFLICT (stock_id, interval, timestamp) DO NOTHING
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

// GET /api/internal/klines/latest?symbol=AAPL&interval=1d - 查询最新K线日期
internalQuotes.get('/klines/latest', async (c) => {
  const symbol = c.req.query('symbol')
  const interval = c.req.query('interval') || '1d'

  const rows = await db.execute(sql`
    SELECT MAX(h.timestamp) as latest
    FROM stock_quote_history h
    JOIN stocks s ON h.stock_id = s.id
    WHERE s.symbol = ${symbol} AND h.interval = ${interval}
  `) as any[]

  const latest = rows?.[0]?.latest || null
  return c.json({ symbol, interval, latest_at: latest ? new Date(latest).toISOString() : null })
})

// GET /api/internal/stocks/symbols - 获取所有股票代码（scheduler 用）
internalQuotes.get('/stocks/symbols', async (c) => {
  const rows = await db.execute(sql`SELECT symbol FROM stocks ORDER BY symbol`) as any[]
  return c.json({ symbols: rows.map((r: any) => r.symbol) })
})

export { internalQuotes }
