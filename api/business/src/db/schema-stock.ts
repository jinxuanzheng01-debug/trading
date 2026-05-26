import { pgTable, serial, varchar, integer, bigint, decimal, timestamp, index, unique, primaryKey } from 'drizzle-orm/pg-core'

export const stocks = pgTable('stocks', {
  id: serial('id').primaryKey(),
  symbol: varchar('symbol', { length: 20 }).notNull().unique(),
  name: varchar('name', { length: 200 }),
  name_cn: varchar('name_cn', { length: 100 }),
  exchange: varchar('exchange', { length: 20 }),
  market: varchar('market', { length: 20 }),
  type: varchar('type', { length: 20 }).default('stock'),
  created_at: timestamp('created_at').defaultNow(),
  updated_at: timestamp('updated_at').defaultNow(),
})

export const stockQuotes = pgTable('stock_quotes', {
  stockId: integer('stock_id').notNull().references(() => stocks.id),
  interval: varchar('interval', { length: 10 }).notNull(),
  open: decimal('open', { precision: 12, scale: 4 }),
  high: decimal('high', { precision: 12, scale: 4 }),
  low: decimal('low', { precision: 12, scale: 4 }),
  close: decimal('close', { precision: 12, scale: 4 }),
  volume: bigint('volume', { mode: 'number' }),
  change: decimal('change', { precision: 12, scale: 4 }),
  change_percent: decimal('change_percent', { precision: 8, scale: 4 }),
  prev_close: decimal('prev_close', { precision: 12, scale: 4 }),
  timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),
  data_date: timestamp('data_date').notNull(),
  updated_at: timestamp('updated_at').defaultNow(),
}, (table) => ({
  pk: primaryKey({ columns: [table.stockId, table.interval] }),
  intervalIdx: index('stock_quotes_interval_idx').on(table.interval),
}))

export const stockQuoteHistory = pgTable('stock_quote_history', {
  id: serial('id').primaryKey(),
  stockId: integer('stock_id').references(() => stocks.id),
  interval: varchar('interval', { length: 10 }).notNull(),
  open: decimal('open', { precision: 12, scale: 4 }),
  high: decimal('high', { precision: 12, scale: 4 }),
  low: decimal('low', { precision: 12, scale: 4 }),
  close: decimal('close', { precision: 12, scale: 4 }),
  volume: bigint('volume', { mode: 'number' }),
  timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),
  created_at: timestamp('created_at').defaultNow(),
}, (table) => ({
  stockIntervalTimestampUnique: unique('stock_interval_timestamp_unique').on(table.stockId, table.interval, table.timestamp),
  stockIdIdx: index('stock_quote_history_stock_id_idx').on(table.stockId),
  intervalIdx: index('stock_quote_history_interval_idx').on(table.interval),
  timestampIdx: index('stock_quote_history_timestamp_idx').on(table.timestamp),
}))

export type StockQuote = typeof stockQuotes.$inferSelect
export type NewStockQuote = typeof stockQuotes.$inferInsert
export type StockQuoteHistory = typeof stockQuoteHistory.$inferSelect
export type NewStockQuoteHistory = typeof stockQuoteHistory.$inferInsert
