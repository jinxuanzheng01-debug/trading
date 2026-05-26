import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db'
import { watchlistGroups, watchlistItems } from '../db/schema'
import { stockQuotes, stockQuoteHistory } from '../db/schema-stock'
import { authMiddleware } from '../middleware/auth'
import { eq, and, desc, gt, lt, or } from 'drizzle-orm'
import { getQuotes, getKlines } from '../lib/market-data-client'
import '../types/hono'

const watchlistQuotes = new Hono()

// Apply auth middleware to all routes
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

// GET /api/watchlist-quotes/groups/:groupId/quotes - Get quotes for a watchlist group
watchlistQuotes.get('/groups/:groupId/quotes', async (c) => {
  const user = c.get('user')
  const groupId = Number(c.req.param('groupId'))

  // Verify ownership
  const [group] = await db.select().from(watchlistGroups)
    .where(and(eq(watchlistGroups.id, groupId), eq(watchlistGroups.userId, user.userId)))
    .limit(1)

  if (!group) {
    return c.json({ error: 'Group not found' }, 404)
  }

  // Get all items in the group
  const items = await db.select().from(watchlistItems)
    .where(eq(watchlistItems.groupId, groupId))
    .orderBy(watchlistItems.sort_order, watchlistItems.createdAt)

  if (items.length === 0) {
    return c.json({ items: [], quotes: [] })
  }

  const symbols = items.map(item => item.symbol)

  // Try to get quotes from cache first
  const cachedQuotes = await db.select().from(stockQuotes)
    .where(eq(stockQuotes.interval, '1d'))

  const cachedQuotesMap = new Map(
    cachedQuotes.map(quote => [`${quote.symbol}_${quote.interval}`, quote])
  )

  const staleSymbols: string[] = []
  const freshQuotes: typeof cachedQuotes = []
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)

  for (const symbol of symbols) {
    const cacheKey = `${symbol}_1d`
    const cached = cachedQuotesMap.get(cacheKey)

    if (!cached || !cached.updated_at || new Date(cached.updated_at) < oneHourAgo) {
      staleSymbols.push(symbol)
    } else {
      freshQuotes.push(cached)
    }
  }

  let finalQuotes = freshQuotes

  // Fetch stale quotes from market-data service
  if (staleSymbols.length > 0) {
    try {
      const freshMarketQuotes = await getQuotes(staleSymbols)

      // Update cache with fresh data
      for (const quote of freshMarketQuotes) {
        await db.insert(stockQuotes)
          .values({
            symbol: quote.symbol,
            market: quote.exchange || 'UNKNOWN',
            name: quote.name || null,
            type: quote.type || null,
            exchange: quote.exchange || null,
            interval: '1d',
            open: quote.prevClose?.toString() || null,
            high: quote.price?.toString() || null,
            low: quote.price?.toString() || null,
            close: quote.price?.toString() || null,
            volume: quote.volume || null,
            change: quote.change?.toString() || null,
            change_percent: quote.changePercent?.toString() || null,
            prev_close: quote.prevClose?.toString() || null,
            timestamp: new Date(),
            data_date: new Date(quote.dataDate),
            updated_at: new Date(),
          })
          .onConflictDoUpdate({
            target: [stockQuotes.symbol, stockQuotes.interval],
            set: {
              market: quote.exchange || 'UNKNOWN',
              name: quote.name || null,
              type: quote.type || null,
              exchange: quote.exchange || null,
              open: quote.prevClose?.toString() || null,
              high: quote.price?.toString() || null,
              low: quote.price?.toString() || null,
              close: quote.price?.toString() || null,
              volume: quote.volume || null,
              change: quote.change?.toString() || null,
              change_percent: quote.changePercent?.toString() || null,
              prev_close: quote.prevClose?.toString() || null,
              timestamp: new Date(),
              data_date: new Date(quote.dataDate),
              updated_at: new Date(),
            },
          })
      }

      // Get updated quotes from cache
      const updatedQuotes = await db.select().from(stockQuotes)
        .where(eq(stockQuotes.interval, '1d'))

      const updatedQuotesMap = new Map(
        updatedQuotes.map(q => [q.symbol, q])
      )

      finalQuotes = freshQuotes.map(q => updatedQuotesMap.get(q.symbol) || q)

      // Add newly fetched quotes
      for (const symbol of staleSymbols) {
        const quote = updatedQuotesMap.get(symbol)
        if (quote && !finalQuotes.find(q => q.symbol === quote.symbol)) {
          finalQuotes.push(quote)
        }
      }
    } catch (error) {
      console.error('Failed to fetch quotes from market-data service:', error)
      // Continue with cached quotes if market-data service is unavailable
    }
  }

  // Map quotes to items
  const quotesMap = new Map(
    finalQuotes.map(quote => [quote.symbol, quote])
  )

  const itemsWithQuotes = items.map(item => ({
    ...item,
    quote: quotesMap.get(item.symbol) || null,
  }))

  return c.json({
    items: itemsWithQuotes,
    quotes: finalQuotes,
  })
})

// POST /api/watchlist-quotes/groups/:groupId/refresh - Force refresh quotes from market-data
watchlistQuotes.post('/groups/:groupId/refresh', async (c) => {
  const user = c.get('user')
  const groupId = Number(c.req.param('groupId'))

  // Verify ownership
  const [group] = await db.select().from(watchlistGroups)
    .where(and(eq(watchlistGroups.id, groupId), eq(watchlistGroups.userId, user.userId)))
    .limit(1)

  if (!group) {
    return c.json({ error: 'Group not found' }, 404)
  }

  // Get all items in the group
  const items = await db.select().from(watchlistItems)
    .where(eq(watchlistItems.groupId, groupId))

  if (items.length === 0) {
    return c.json({ items: [], quotes: [] })
  }

  const symbols = items.map(item => item.symbol)

  try {
    // Fetch fresh quotes from market-data service
    const freshMarketQuotes = await getQuotes(symbols)

    // Update cache
    for (const quote of freshMarketQuotes) {
      await db.insert(stockQuotes)
        .values({
          symbol: quote.symbol,
          market: quote.exchange || 'UNKNOWN',
          name: quote.name || null,
          type: quote.type || null,
          exchange: quote.exchange || null,
          interval: '1d',
          open: quote.prevClose?.toString() || null,
          high: quote.price?.toString() || null,
          low: quote.price?.toString() || null,
          close: quote.price?.toString() || null,
          volume: quote.volume || null,
          change: quote.change?.toString() || null,
          change_percent: quote.changePercent?.toString() || null,
          prev_close: quote.prevClose?.toString() || null,
          timestamp: new Date(),
          data_date: new Date(quote.dataDate),
          updated_at: new Date(),
        })
        .onConflictDoUpdate({
          target: [stockQuotes.symbol, stockQuotes.interval],
          set: {
            market: quote.exchange || 'UNKNOWN',
            name: quote.name || null,
            type: quote.type || null,
            exchange: quote.exchange || null,
            open: quote.prevClose?.toString() || null,
            high: quote.price?.toString() || null,
            low: quote.price?.toString() || null,
            close: quote.price?.toString() || null,
            volume: quote.volume || null,
            change: quote.change?.toString() || null,
            change_percent: quote.changePercent?.toString() || null,
            prev_close: quote.prevClose?.toString() || null,
            timestamp: new Date(),
            data_date: new Date(quote.dataDate),
            updated_at: new Date(),
          },
        })
    }

    // Get updated quotes from cache
    const updatedQuotes = await db.select().from(stockQuotes)
      .where(eq(stockQuotes.interval, '1d'))

    const quotesMap = new Map(
      updatedQuotes.map(quote => [quote.symbol, quote])
    )

    const itemsWithQuotes = items.map(item => ({
      ...item,
      quote: quotesMap.get(item.symbol) || null,
    }))

    return c.json({
      items: itemsWithQuotes,
      quotes: updatedQuotes,
    })
  } catch (error) {
    console.error('Failed to refresh quotes:', error)
    return c.json({ error: 'Failed to refresh quotes from market-data service' }, 503)
  }
})

// PUT /api/watchlist-quotes/groups/:groupId/reorder - Reorder items in group
watchlistQuotes.put('/groups/:groupId/reorder', zValidator('json', reorderItemsSchema), async (c) => {
  const user = c.get('user')
  const groupId = Number(c.req.param('groupId'))
  const { itemOrders } = c.req.valid('json')

  // Verify ownership
  const [group] = await db.select().from(watchlistGroups)
    .where(and(eq(watchlistGroups.id, groupId), eq(watchlistGroups.userId, user.userId)))
    .limit(1)

  if (!group) {
    return c.json({ error: 'Group not found' }, 404)
  }

  // Check if all items exist and belong to this group
  for (const { id, sort_order } of itemOrders) {
    const [item] = await db.select().from(watchlistItems)
      .where(and(eq(watchlistItems.id, id), eq(watchlistItems.groupId, groupId)))
      .limit(1)

    if (!item) {
      return c.json({ error: `Item ${id} does not belong to this group` }, 400)
    }

    // Update sort_order
    await db.update(watchlistItems)
      .set({ sort_order, updatedAt: new Date() })
      .where(eq(watchlistItems.id, id))
  }

  // Return updated items
  const updatedItems = await db.select().from(watchlistItems)
    .where(eq(watchlistItems.groupId, groupId))
    .orderBy(watchlistItems.sort_order, watchlistItems.createdAt)

  return c.json(updatedItems)
})

// GET /api/watchlist-quotes/items/:itemId/kline - Get K-line data for an item
watchlistQuotes.get('/items/:itemId/kline', zValidator('query', klineQuerySchema), async (c) => {
  const user = c.get('user')
  const itemId = Number(c.req.param('itemId'))
  const { interval, limit } = c.req.valid('query')

  // Verify ownership through group
  const [item] = await db.select({
    item: watchlistItems,
  })
    .from(watchlistItems)
    .innerJoin(watchlistGroups, eq(watchlistItems.groupId, watchlistGroups.id))
    .where(and(eq(watchlistItems.id, itemId), eq(watchlistGroups.userId, user.userId)))
    .limit(1)

  if (!item) {
    return c.json({ error: 'Item not found' }, 404)
  }

  const symbol = item.item.symbol
  const queryLimit = limit || 100

  try {
    // Fetch K-line data from market-data service
    const klines = await getKlines(symbol, interval, queryLimit)

    // Also store in history table for cache
    for (const kline of klines) {
      try {
        await db.insert(stockQuoteHistory)
          .values({
            symbol: kline.symbol,
            market: 'UNKNOWN', // Market-data service doesn't provide market in kline response
            interval: kline.interval,
            open: kline.open?.toString() || null,
            high: kline.high?.toString() || null,
            low: kline.low?.toString() || null,
            close: kline.close?.toString() || null,
            volume: kline.volume || null,
            amount: null,
            change: kline.close?.toString() || null, // Use close as change proxy
            timestamp: new Date(kline.timestamp),
          })
          .onConflictDoNothing() // Don't overwrite existing historical data
      } catch (err) {
        // Ignore duplicate key errors
        const error = err as Error
        if (!error.message.includes('duplicate key')) {
          console.error('Failed to insert kline history:', error)
        }
      }
    }

    return c.json({
      symbol,
      interval,
      data: klines,
    })
  } catch (error) {
    console.error('Failed to fetch kline data:', error)
    return c.json({ error: 'Failed to fetch kline data from market-data service' }, 503)
  }
})

export { watchlistQuotes }
