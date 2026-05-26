import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db'
import { stockQuotes } from '../db/schema-stock'
import { eq, inArray } from 'drizzle-orm'

const internalQuotes = new Hono()

// Simple schema for quotes update
const quoteUpdateSchema = z.array(z.object({
  symbol: z.string(),
  name: z.string().nullable().optional(),
  price: z.number().nullable().optional(),
  change: z.number().nullable().optional(),
  changePercent: z.number().nullable().optional(),
  volume: z.number().nullable().optional(),
  high: z.number().nullable().optional(),
  low: z.number().nullable().optional(),
  open: z.number().nullable().optional(),
  prevClose: z.number().nullable().optional(),
  exchange: z.string().nullable().optional(),
  market: z.string().optional(),
  currency: z.string().optional(),
}))

// POST /api/internal/quotes/batch-update - Batch update quotes cache (internal, for scheduler)
internalQuotes.post('/quotes/batch-update', zValidator('json', quoteUpdateSchema), async (c) => {
  const quotes = c.req.valid('json')

  if (quotes.length === 0) {
    return c.json({ success: true, updated: 0 })
  }

  try {
    let updatedCount = 0

    for (const quote of quotes) {
      try {
        await db.insert(stockQuotes)
          .values({
            symbol: quote.symbol,
            market: quote.market || quote.exchange || 'UNKNOWN',
            name: quote.name || null,
            type: null,
            exchange: quote.exchange || null,
            interval: '1d',
            open: quote.open?.toString() || quote.prevClose?.toString() || null,
            high: quote.high?.toString() || quote.price?.toString() || null,
            low: quote.low?.toString() || quote.price?.toString() || null,
            close: quote.price?.toString() || null,
            volume: quote.volume || null,
            amount: null,
            change: quote.change?.toString() || null,
            change_percent: quote.changePercent?.toString() || null,
            turnover_rate: null,
            prev_close: quote.prevClose?.toString() || null,
            timestamp: new Date(),
            data_date: new Date(),
            updated_at: new Date(),
          })
          .onConflictDoUpdate({
            target: [stockQuotes.symbol, stockQuotes.interval],
            set: {
              market: quote.market || quote.exchange || 'UNKNOWN',
              name: quote.name || null,
              exchange: quote.exchange || null,
              open: quote.open?.toString() || quote.prevClose?.toString() || null,
              high: quote.high?.toString() || quote.price?.toString() || null,
              low: quote.low?.toString() || quote.price?.toString() || null,
              close: quote.price?.toString() || null,
              volume: quote.volume || null,
              amount: null,
              change: quote.change?.toString() || null,
              change_percent: quote.changePercent?.toString() || null,
              turnover_rate: null,
              prev_close: quote.prevClose?.toString() || null,
              timestamp: new Date(),
              data_date: new Date(),
              updated_at: new Date(),
            },
          })
        updatedCount++
      } catch (error) {
        console.error(`Failed to update quote for ${quote.symbol}:`, error)
        // Continue with next quote
      }
    }

    return c.json({ success: true, updated: updatedCount })
  } catch (error) {
    console.error('Failed to batch update quotes:', error)
    return c.json({ success: false, error: 'Failed to update quotes cache' }, 500)
  }
})

export { internalQuotes }
