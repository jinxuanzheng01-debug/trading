import { pgTable, serial, text, timestamp, varchar, boolean, integer } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  username: varchar('username', { length: 50 }).notNull().unique(),
  password: varchar('password', { length: 255 }).notNull(),
  role: varchar('role', { length: 20 }).notNull().default('user'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

export const watchlistGroups = pgTable('watchlist_groups', {
  id: serial('id').primaryKey(),
  userId: serial('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  isDefault: boolean('is_default').default(false),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

export const watchlistItems = pgTable('watchlist_items', {
  id: serial('id').primaryKey(),
  groupId: serial('group_id').notNull().references(() => watchlistGroups.id, { onDelete: 'cascade' }),
  symbol: varchar('symbol', { length: 20 }).notNull(),
  name: varchar('name', { length: 100 }),
  type: varchar('type', { length: 20 }).default('stock'), // stock, etf, index, crypto
  exchange: varchar('exchange', { length: 20 }), // NYSE, NASDAQ, SSE, HKEX
  notes: text('notes'),
  sort_order: integer('sort_order').default(0),
  market: varchar('market', { length: 20 }),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

export const analysisRuns = pgTable('analysis_runs', {
  id: serial('id').primaryKey(),
  userId: serial('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  ticker: varchar('ticker', { length: 20 }).notNull(),
  market: varchar('market', { length: 10 }).notNull(),
  depth: varchar('depth', { length: 20 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  result: text('result'),
  layerOutputs: text('layer_outputs'),
  llmProvider: varchar('llm_provider', { length: 50 }),
  createdAt: timestamp('created_at').defaultNow(),
  completedAt: timestamp('completed_at'),
})

export const backtestRuns = pgTable('backtest_runs', {
  id: serial('id').primaryKey(),
  userId: serial('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  strategyName: varchar('strategy_name', { length: 100 }).notNull(),
  strategyCode: text('strategy_code').notNull(),
  strategyType: varchar('strategy_type', { length: 20 }).notNull(),
  config: text('config').notNull(),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  metrics: text('metrics'),
  equityCurve: text('equity_curve'),
  trades: text('trades'),
  error: text('error'),
  createdAt: timestamp('created_at').defaultNow(),
  completedAt: timestamp('completed_at'),
})

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type WatchlistGroup = typeof watchlistGroups.$inferSelect
export type NewWatchlistGroup = typeof watchlistGroups.$inferInsert
export type WatchlistItem = typeof watchlistItems.$inferSelect
export type NewWatchlistItem = typeof watchlistItems.$inferInsert
export type AnalysisRun = typeof analysisRuns.$inferSelect
export type BacktestRun = typeof backtestRuns.$inferSelect

// Re-export types from schema-stock for convenience
export type { StockQuote, NewStockQuote, StockQuoteHistory, NewStockQuoteHistory } from './schema-stock'
