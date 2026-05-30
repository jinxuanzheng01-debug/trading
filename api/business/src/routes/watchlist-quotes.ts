import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db'
import { watchlistGroups, watchlistItems, stocks } from '../db/schema'
import { authMiddleware } from '../middleware/auth'
import { eq, and, sql } from 'drizzle-orm'
import { getQuotes, getKlines } from '../lib/market-data-client'
import { ok, fail, ErrorCode } from '../lib/response'
import '../types/hono'

const watchlistQuotes = new Hono()

watchlistQuotes.use('*', authMiddleware)

const reorderItemsSchema = z.object({
  itemOrders: z.array(z.object({
    id: z.number(),
    sort_order: z.number(),
  })),
})

const klineQuerySchema = z.object({
  interval: z.enum(['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w', '1M']).default('1d'),
  limit: z.coerce.number().min(1).max(1000).optional(),
})

/** 将行情数据写入 stock_quotes 表 */
async function saveQuotesToDB(quotes: Awaited<ReturnType<typeof getQuotes>>) {
  for (const q of quotes) {
    await db.execute(sql`
      INSERT INTO stocks (symbol, name, exchange, type)
      VALUES (${q.symbol}, ${q.name || null}, ${q.exchange || null}, ${q.type || 'stock'})
      ON CONFLICT (symbol) DO UPDATE SET name = EXCLUDED.name, updated_at = NOW();

      INSERT INTO stock_quotes (stock_id,
        price, open, high, low, volume, change, change_percent, prev_close,
        timestamp, data_date, updated_at)
      SELECT s.id,
        ${String(q.price)}::numeric, ${String(q.price)}::numeric, ${String(q.price)}::numeric, ${String(q.price)}::numeric,
        ${q.volume || 0}::bigint, ${String(q.change)}::numeric, ${String(q.changePercent)}::numeric, ${String(q.prevClose)}::numeric,
        NOW(), ${q.dataDate.toISOString()}::timestamp, NOW()
      FROM stocks s WHERE s.symbol = ${q.symbol}
      ON CONFLICT (stock_id)
      DO UPDATE SET
        price = EXCLUDED.price, open = EXCLUDED.open, high = EXCLUDED.high, low = EXCLUDED.low,
        volume = EXCLUDED.volume, change = EXCLUDED.change, change_percent = EXCLUDED.change_percent,
        prev_close = EXCLUDED.prev_close, timestamp = NOW(), data_date = EXCLUDED.data_date, updated_at = NOW()
    `)
  }
}

// GET /api/watchlist-quotes/groups/:groupId/quotes
watchlistQuotes.get('/groups/:groupId/quotes', async (c) => {
  const user = c.get('user')
  const groupId = Number(c.req.param('groupId'))

  const [group] = await db.select().from(watchlistGroups)
    .where(and(eq(watchlistGroups.id, groupId), eq(watchlistGroups.userId, user.userId)))
    .limit(1)

  if (!group) {
    return fail(c, ErrorCode.GROUP_NOT_FOUND)
  }

  const items = await db
    .select({
      id: watchlistItems.id,
      groupId: watchlistItems.groupId,
      stockId: watchlistItems.stockId,
      symbol: stocks.symbol,
      name: stocks.name,
      nameCn: stocks.name_cn,
      exchange: stocks.exchange,
      market: stocks.market,
      type: stocks.type,
      sortOrder: watchlistItems.sortOrder,
      notes: watchlistItems.notes,
      createdAt: watchlistItems.createdAt,
      updatedAt: watchlistItems.updatedAt,
    })
    .from(watchlistItems)
    .innerJoin(stocks, eq(watchlistItems.stockId, stocks.id))
    .where(eq(watchlistItems.groupId, groupId))
    .orderBy(watchlistItems.sortOrder, watchlistItems.createdAt)

  if (items.length === 0) {
    return ok(c, { items: [], quotes: [] })
  }

  const symbols = items.map(item => item.symbol)

  // 从 PG 读 stock_quotes 表
  const quoteRows = await db.execute(sql`
    SELECT s.symbol, q.price, q.change, q.change_percent as "changePercent",
           q.open, q.high, q.low, q.volume, q.prev_close as "prevClose",
           q.market_cap as "marketCap", q.currency
    FROM stocks s
    JOIN stock_quotes q ON s.id = q.stock_id
    WHERE s.symbol = ANY(${sql`ARRAY[${sql.join(symbols.map(s => sql`${s}`), sql`, `)}]`}::text[])
  `) as any
  // PG numeric 类型返回字符串，转为 number
  const toNum = (v: any) => v == null ? null : Number(v)
  const castQuote = (q: any) => ({
    ...q,
    price: toNum(q.price),
    change: toNum(q.change),
    changePercent: toNum(q.changePercent ?? q.change_percent),
    open: toNum(q.open),
    high: toNum(q.high),
    low: toNum(q.low),
    volume: toNum(q.volume),
    prevClose: toNum(q.prevClose ?? q.prev_close),
    marketCap: toNum(q.marketCap ?? q.market_cap),
  })

  const quoteArr = (Array.isArray(quoteRows) ? quoteRows : (quoteRows as any).rows || []).map(castQuote)

  if (quoteArr.length > 0) {
    const itemsWithQuotes = items.map(item => {
      const q = quoteArr.find((r: any) => r.symbol === item.symbol)
      return { ...item, quote: q || null }
    })
    return ok(c, { items: itemsWithQuotes, quotes: quoteArr })
  }

  // PG 无数据，降级 market-data
  try {
    const freshQuotes = await getQuotes(symbols)
    saveQuotesToDB(freshQuotes).catch(err => console.error('Failed to save quotes to DB:', err))
    const quotesMap = new Map(freshQuotes.map(quote => [quote.symbol, quote]))
    const itemsWithQuotes = items.map(item => ({ ...item, quote: quotesMap.get(item.symbol) || null }))
    return ok(c, { items: itemsWithQuotes, quotes: freshQuotes })
  } catch (error) {
    console.error('Failed to fetch quotes:', error)
    return ok(c, { items: items.map(item => ({ ...item, quote: null })), quotes: [] })
  }
})

// POST /api/watchlist-quotes/groups/:groupId/refresh
watchlistQuotes.post('/groups/:groupId/refresh', async (c) => {
  const user = c.get('user')
  const groupId = Number(c.req.param('groupId'))

  const [group] = await db.select().from(watchlistGroups)
    .where(and(eq(watchlistGroups.id, groupId), eq(watchlistGroups.userId, user.userId)))
    .limit(1)

  if (!group) return fail(c, ErrorCode.GROUP_NOT_FOUND)

  const items = await db
    .select({ symbol: stocks.symbol })
    .from(watchlistItems)
    .innerJoin(stocks, eq(watchlistItems.stockId, stocks.id))
    .where(eq(watchlistItems.groupId, groupId))

  if (items.length === 0) return ok(c, { items: [], quotes: [] })

  const symbols = items.map(i => i.symbol)

  try {
    const freshQuotes = await getQuotes(symbols)
    saveQuotesToDB(freshQuotes).catch(err => console.error('Failed to save quotes:', err))

    const quotesMap = new Map(freshQuotes.map(quote => [quote.symbol, quote]))
    const itemsWithQuotes = items.map(item => ({ ...item, quote: quotesMap.get(item.symbol) || null }))

    return ok(c, { items: itemsWithQuotes, quotes: freshQuotes })
  } catch (error) {
    console.error('Failed to refresh quotes:', error)
    return fail(c, ErrorCode.MARKET_DATA_UNAVAILABLE)
  }
})

// GET /api/watchlist-quotes/items/:itemId/kline
watchlistQuotes.get('/items/:itemId/kline', zValidator('query', klineQuerySchema), async (c) => {
  const user = c.get('user')
  const itemId = Number(c.req.param('itemId'))
  const { interval, limit } = c.req.valid('query')

  const [row] = await db
    .select({ symbol: stocks.symbol })
    .from(watchlistItems)
    .innerJoin(stocks, eq(watchlistItems.stockId, stocks.id))
    .innerJoin(watchlistGroups, eq(watchlistItems.groupId, watchlistGroups.id))
    .where(and(eq(watchlistItems.id, itemId), eq(watchlistGroups.userId, user.userId)))
    .limit(1)

  if (!row) return fail(c, ErrorCode.ITEM_NOT_FOUND)

  try {
    const klines = await getKlines(row.symbol, interval, limit || 100)
    return ok(c, { symbol: row.symbol, interval, data: klines })
  } catch (error) {
    console.error('Failed to fetch kline data:', error)
    return fail(c, ErrorCode.MARKET_DATA_UNAVAILABLE)
  }
})

export { watchlistQuotes }
