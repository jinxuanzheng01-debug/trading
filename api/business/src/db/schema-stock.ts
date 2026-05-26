import { pgTable, serial, varchar, text, integer, bigint, decimal, timestamp, index, unique } from 'drizzle-orm/pg-core'

export const stockQuotes = pgTable('stock_quotes', {
  symbol: varchar('symbol', { length: 50 }).primaryKey(),
  market: varchar('market', { length: 20 }).notNull(),
  name: varchar('name', { length: 100 }),
  type: varchar('type', { length: 20 }),
  exchange: varchar('exchange', { length: 50 }),
  interval: varchar('interval', { length: 10 }).notNull(), // 1d/1w/1m
  open: decimal('open', { precision: 12, scale: 4 }),
  high: decimal('high', { precision: 12, scale: 4 }),
  low: decimal('low', { precision: 12, scale: 4 }),
  close: decimal('close', { precision: 12, scale: 4 }),
  volume: bigint('volume', { mode: 'number' }),
  amount: bigint('amount', { mode: 'number' }),
  change: decimal('change', { precision: 12, scale: 4 }),
  change_percent: decimal('change_percent', { precision: 8, scale: 4 }),
  turnover_rate: decimal('turnover_rate', { precision: 8, scale: 4 }),
  prev_close: decimal('prev_close', { precision: 12, scale: 4 }),
  timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),
  data_date: timestamp('data_date').notNull(),
  updated_at: timestamp('updated_at').defaultNow(),
}, (table) => ({
  marketIdx: index('stock_quotes_market_idx').on(table.market),
  intervalIdx: index('stock_quotes_interval_idx').on(table.interval),
  symbolIntervalUnique: unique('symbol_interval_unique').on(table.symbol, table.interval),
}))

export const stockQuoteHistory = pgTable('stock_quote_history', {
  id: serial('id').primaryKey(),
  symbol: varchar('symbol', { length: 50 }).notNull(),
  market: varchar('market', { length: 20 }).notNull(),
  interval: varchar('interval', { length: 10 }).notNull(),
  open: decimal('open', { precision: 12, scale: 4 }),
  high: decimal('high', { precision: 12, scale: 4 }),
  low: decimal('low', { precision: 12, scale: 4 }),
  close: decimal('close', { precision: 12, scale: 4 }),
  volume: bigint('volume', { mode: 'number' }),
  amount: bigint('amount', { mode: 'number' }),
  change: decimal('change', { precision: 12, scale: 4 }),
  change_percent: decimal('change_percent', { precision: 8, scale: 4 }),
  timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),
  created_at: timestamp('created_at').defaultNow(),
}, (table) => ({
  symbolIntervalTimeUnique: unique('symbol_interval_time_unique').on(table.symbol, table.interval, table.timestamp),
  symbolIdx: index('stock_quote_history_symbol_idx').on(table.symbol),
  intervalIdx: index('stock_quote_history_interval_idx').on(table.interval),
  timestampIdx: index('stock_quote_history_timestamp_idx').on(table.timestamp),
}))

export type StockQuote = typeof stockQuotes.$inferSelect
export type NewStockQuote = typeof stockQuotes.$inferInsert
export type StockQuoteHistory = typeof stockQuoteHistory.$inferSelect
export type NewStockQuoteHistory = typeof stockQuoteHistory.$inferInsert
