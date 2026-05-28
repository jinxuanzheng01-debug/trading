import { pgTable, serial, text, timestamp, varchar, boolean, integer } from 'drizzle-orm/pg-core'
import { stocks } from './schema-stock'

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
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  isDefault: boolean('is_default').default(false),
  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

export const watchlistItems = pgTable('watchlist_items', {
  id: serial('id').primaryKey(),
  groupId: integer('group_id').notNull().references(() => watchlistGroups.id, { onDelete: 'cascade' }),
  stockId: integer('stock_id').references(() => stocks.id),
  notes: text('notes'),
  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

export const analysisRuns = pgTable('analysis_runs', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
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
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
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

export const notifications = pgTable('notifications', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 30 }).notNull(),
  title: varchar('title', { length: 200 }).notNull(),
  content: text('content'),
  link: varchar('link', { length: 500 }),
  isRead: boolean('is_read').default(false),
  createdAt: timestamp('created_at').defaultNow(),
})

// Types
export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type WatchlistGroup = typeof watchlistGroups.$inferSelect
export type NewWatchlistGroup = typeof watchlistGroups.$inferInsert
export type WatchlistItem = typeof watchlistItems.$inferSelect
export type NewWatchlistItem = typeof watchlistItems.$inferInsert
export type AnalysisRun = typeof analysisRuns.$inferSelect
export type BacktestRun = typeof backtestRuns.$inferSelect
export type Notification = typeof notifications.$inferSelect

// Re-export stock-related schema and types
export {
  stocks,
  stockQuotes,
  quoteSnapshots,
  klines,
} from './schema-stock'
export type {
  Stock,
  NewStock,
  StockQuote,
  NewStockQuote,
  QuoteSnapshot,
  NewQuoteSnapshot,
  Kline,
  NewKline,
} from './schema-stock'

// Re-export paper trading schema and types
export {
  paperWallets,
  paperPositions,
  paperOrders,
} from './schema-paper'
export type {
  PaperWallet,
  NewPaperWallet,
  PaperPosition,
  NewPaperPosition,
  PaperOrder,
  NewPaperOrder,
} from './schema-paper'
