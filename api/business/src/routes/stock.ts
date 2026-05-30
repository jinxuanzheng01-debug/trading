import { Hono } from 'hono'
import { db } from '../db'
import { stocks } from '../db/schema-stock'
import { eq, sql } from 'drizzle-orm'
import { ok, fail } from '../lib/response'
import type { StockDetailResponse } from '@trading-agent/types'

const stock = new Hono()

/**
 * GET /api/stock/search?q=keyword
 * 模糊搜索股票（symbol/name/name_cn）
 * 必须在 /:symbol 之前注册，否则 "search" 会被当作 symbol 匹配
 */
stock.get('/search', async (c) => {
  const q = c.req.query('q')
  if (!q || q.trim().length === 0) {
    return ok(c, [])
  }

  const keyword = `%${q.trim()}%`
  const prefix = `${q.trim().toUpperCase()}%`

  const rows = await db.execute(sql`
    SELECT symbol, name, name_cn as "nameCn", exchange, market, type
    FROM stocks
    WHERE symbol ILIKE ${prefix} OR name ILIKE ${keyword} OR name_cn ILIKE ${keyword}
    ORDER BY
      CASE WHEN symbol ILIKE ${prefix} THEN 0 ELSE 1 END,
      symbol
    LIMIT 15
  `) as any[]

  return ok(c, rows)
})

/**
 * GET /api/stock/list?page=1&pageSize=50&q=keyword
 * 股票列表（分页+搜索）
 */
stock.get('/list', async (c) => {
  const page = parseInt(c.req.query('page') || '1', 10)
  const pageSize = Math.min(parseInt(c.req.query('pageSize') || '50', 10), 200)
  const q = c.req.query('q') || ''
  const offset = (page - 1) * pageSize

  try {
    const dbData = q
      ? await db.execute(sql`
          SELECT symbol, name, exchange, market, type, sector FROM stocks
          WHERE symbol ILIKE ${'%' + q + '%'} OR name ILIKE ${'%' + q + '%'}
          ORDER BY symbol LIMIT ${pageSize} OFFSET ${offset}
        `)
      : await db.execute(sql`
          SELECT symbol, name, exchange, market, type, sector FROM stocks
          ORDER BY symbol LIMIT ${pageSize} OFFSET ${offset}
        `)
    const rows = Array.isArray(dbData) ? dbData : (dbData as any).rows || []
    return ok(c, rows)
  } catch (e) {
    return fail(c, 50301, '查询失败')
  }
})

/**
 * GET /api/stock/:symbol
 * 获取综合股票信息（纯 PG 读，不走外部数据源）
 */
stock.get('/:symbol', async (c) => {
  const symbol = c.req.param('symbol')?.toUpperCase()

  if (!symbol) {
    return fail(c, 40002, '股票代码不能为空')
  }

  try {
    const rows = await db.execute(sql`
      SELECT s.symbol, s.name, s.name_cn as "nameCn", s.exchange, s.market, s.type, s.sector, s.industry,
             q.price, q.change, q.change_percent as "changePercent",
             q.open, q.high, q.low, q.volume, q.prev_close as "prevClose",
             q.market_cap as "marketCap", q.currency, q.timestamp,
             f.trailing_pe as "trailingPE", f.forward_pe as "forwardPE",
             f.price_to_book as "priceToBook", f.beta, f.dividend_yield as "dividendYield",
             f.fifty_two_week_high as "fiftyTwoWeekHigh", f.fifty_two_week_low as "fiftyTwoWeekLow",
             f.eps, f.shares_outstanding as "sharesOutstanding"
      FROM stocks s
      LEFT JOIN stock_quotes q ON s.id = q.stock_id
      LEFT JOIN stock_fundamentals f ON s.id = f.stock_id
      WHERE s.symbol = ${symbol}
      LIMIT 1
    `)
    const rowsArr = Array.isArray(rows) ? rows : (rows as any).rows || []
    const r = rowsArr[0]
    if (!r) return fail(c, 40002, '未找到该股票代码')

    const response: StockDetailResponse = {
      info: {
        symbol: r.symbol,
        name: r.name,
        nameCn: r.nameCn,
        exchange: r.exchange,
        market: r.market,
        type: r.type,
        sector: r.sector,
        industry: r.industry,
      },
      quote: {
        symbol: r.symbol,
        name: r.nameCn || r.name || r.symbol,
        price: Number(r.price || 0),
        change: Number(r.change || 0),
        changePercent: Number(r.changePercent || 0),
        volume: Number(r.volume || 0),
        high: Number(r.high || 0),
        low: Number(r.low || 0),
        open: Number(r.open || 0),
        prevClose: Number(r.prevClose || 0),
        marketCap: Number(r.marketCap || 0),
        currency: r.currency || 'USD',
        dataDate: r.timestamp || new Date().toISOString(),
      },
      metrics: {
        marketCap: Number(r.marketCap || 0),
        trailingPE: r.trailingPE ? Number(r.trailingPE) : undefined,
        forwardPE: r.forwardPE ? Number(r.forwardPE) : undefined,
        priceToBook: r.priceToBook ? Number(r.priceToBook) : undefined,
        beta: r.beta ? Number(r.beta) : undefined,
        fiftyTwoWeekHigh: r.fiftyTwoWeekHigh ? Number(r.fiftyTwoWeekHigh) : undefined,
        fiftyTwoWeekLow: r.fiftyTwoWeekLow ? Number(r.fiftyTwoWeekLow) : undefined,
        dividendYield: r.dividendYield ? Number(r.dividendYield) : undefined,
        eps: r.eps ? Number(r.eps) : undefined,
        sharesOutstanding: r.sharesOutstanding ? Number(r.sharesOutstanding) : undefined,
      },
    }
    return ok(c, response)
  } catch (error) {
    console.error('Error fetching stock detail:', error)
    return fail(c, 50301, '数据查询失败')
  }
})

/**
 * GET /api/stock/:symbol/kline
 * 获取K线数据 — 日线直读，周/月线从日线聚合
 */
stock.get('/:symbol/kline', async (c) => {
  const symbol = c.req.param('symbol')?.toUpperCase()
  if (!symbol) return fail(c, 40002, '股票代码不能为空')

  const query = c.req.query()
  const limit = query.limit ? parseInt(query.limit, 10) : 252
  const interval = query.interval || '1d'
  const startTs = query.start

  try {
    let dbData: any

    if (interval === '1d') {
      let startFilter = sql``
      if (startTs) startFilter = sql`AND k.timestamp < to_timestamp(${parseInt(startTs, 10)})`

      dbData = await db.execute(sql`
        SELECT k.timestamp, k.open, k.high, k.low, k.close, k.volume
        FROM klines k JOIN stocks s ON k.stock_id = s.id
        WHERE s.symbol = ${symbol} ${startFilter}
        ORDER BY k.timestamp DESC LIMIT ${limit}
      `)
    } else {
      // 周线/月线：从日线聚合
      const bucket = interval === '1w' ? sql`date_trunc('week', k.timestamp)` : sql`date_trunc('month', k.timestamp)`
      let startFilter = sql``
      if (startTs) startFilter = sql`AND k.timestamp < to_timestamp(${parseInt(startTs, 10)})`

      dbData = await db.execute(sql`
        SELECT ${bucket} as timestamp,
               (array_agg(open ORDER BY k.timestamp ASC))[1] as open,
               MAX(k.high) as high,
               MIN(k.low) as low,
               (array_agg(close ORDER BY k.timestamp ASC))[array_upper(array_agg(close ORDER BY k.timestamp ASC), 1)] as close,
               SUM(k.volume)::bigint as volume
        FROM klines k JOIN stocks s ON k.stock_id = s.id
        WHERE s.symbol = ${symbol} ${startFilter}
        GROUP BY ${bucket}
        ORDER BY timestamp DESC LIMIT ${limit}
      `)
    }

    const rows = Array.isArray(dbData) ? dbData : (dbData as any).rows || []
    const data = rows.reverse().map((r: any) => ({
      symbol,
      interval,
      open: Number(r.open),
      high: Number(r.high),
      low: Number(r.low),
      close: Number(r.close),
      volume: Number(r.volume),
      timestamp: r.timestamp instanceof Date ? r.timestamp.toISOString() : String(r.timestamp),
      dataDate: r.timestamp instanceof Date ? r.timestamp.toISOString() : String(r.timestamp),
    }))

    return ok(c, { symbol, interval, limit, data })
  } catch (error) {
    console.error('Error fetching kline data:', error)
    return fail(c, 50301, '数据查询失败')
  }
})

export default stock
