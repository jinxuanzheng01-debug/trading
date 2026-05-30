import { pgTable, serial, text, timestamp, varchar, boolean, integer } from 'drizzle-orm/pg-core'
import { stocks } from './schema-stock'

const tz = { withTimezone: true } as const

// 用户表
export const users = pgTable('users', {
  id: serial('id').primaryKey(),                                       // 用户ID
  email: varchar('email', { length: 255 }).notNull().unique(),         // 邮箱（唯一）
  username: varchar('username', { length: 50 }).notNull().unique(),    // 用户名（唯一）
  password: varchar('password', { length: 255 }).notNull(),            // bcrypt 加密密码
  role: varchar('role', { length: 20 }).notNull().default('user'),     // 角色：admin / user
  createdAt: timestamp('created_at', tz).defaultNow(),                 // 创建时间
  updatedAt: timestamp('updated_at', tz).defaultNow(),                 // 更新时间
})

// 自选分组
export const watchlistGroups = pgTable('watchlist_groups', {
  id: serial('id').primaryKey(),                                        // 分组ID
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }), // 所属用户
  name: varchar('name', { length: 100 }).notNull(),                     // 分组名称
  description: text('description'),                                     // 分组描述
  isDefault: boolean('is_default').default(false),                      // 是否默认分组
  sortOrder: integer('sort_order').default(0),                          // 排序
  createdAt: timestamp('created_at', tz).defaultNow(),                  // 创建时间
  updatedAt: timestamp('updated_at', tz).defaultNow(),                  // 更新时间
})

// 自选标的（用户关注的股票）
export const watchlistItems = pgTable('watchlist_items', {
  id: serial('id').primaryKey(),                                        // 记录ID
  groupId: integer('group_id').notNull().references(() => watchlistGroups.id, { onDelete: 'cascade' }), // 所属分组
  stockId: integer('stock_id').references(() => stocks.id),             // 关联股票
  notes: text('notes'),                                                 // 备注
  sortOrder: integer('sort_order').default(0),                          // 排序
  createdAt: timestamp('created_at', tz).defaultNow(),                  // 创建时间
  updatedAt: timestamp('updated_at', tz).defaultNow(),                  // 更新时间
})

// AI 分析任务
export const analysisRuns = pgTable('analysis_runs', {
  id: serial('id').primaryKey(),                                        // 任务ID
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }), // 发起用户
  ticker: varchar('ticker', { length: 20 }).notNull(),                  // 股票代码
  market: varchar('market', { length: 10 }).notNull(),                  // 市场
  depth: varchar('depth', { length: 20 }).notNull(),                    // 分析深度
  status: varchar('status', { length: 20 }).notNull().default('pending'), // 状态：pending/processing/completed/failed
  result: text('result'),                                               // 分析结果 JSON
  layerOutputs: text('layer_outputs'),                                  // 各层输出 JSON
  llmProvider: varchar('llm_provider', { length: 50 }),                 // 使用的 LLM 提供商
  createdAt: timestamp('created_at', tz).defaultNow(),                  // 创建时间
  completedAt: timestamp('completed_at', tz),                           // 完成时间
})

// 回测任务
export const backtestRuns = pgTable('backtest_runs', {
  id: serial('id').primaryKey(),                                        // 任务ID
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }), // 发起用户
  strategyName: varchar('strategy_name', { length: 100 }).notNull(),    // 策略名称
  strategyCode: text('strategy_code').notNull(),                        // 策略代码
  strategyType: varchar('strategy_type', { length: 20 }).notNull(),     // 策略类型
  config: text('config').notNull(),                                     // 回测配置 JSON
  status: varchar('status', { length: 20 }).notNull().default('pending'), // 状态：pending/running/completed/failed
  metrics: text('metrics'),                                             // 回测指标 JSON
  equityCurve: text('equity_curve'),                                    // 权益曲线 JSON
  trades: text('trades'),                                               // 交易记录 JSON
  error: text('error'),                                                 // 错误信息
  createdAt: timestamp('created_at', tz).defaultNow(),                  // 创建时间
  completedAt: timestamp('completed_at', tz),                           // 完成时间
})

// 用户通知
export const notifications = pgTable('notifications', {
  id: serial('id').primaryKey(),                                        // 通知ID
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }), // 接收用户
  type: varchar('type', { length: 30 }).notNull(),                      // 类型：analysis_complete / system / alert
  title: varchar('title', { length: 200 }).notNull(),                   // 通知标题
  content: text('content'),                                             // 通知内容
  link: varchar('link', { length: 500 }),                               // 跳转链接
  isRead: boolean('is_read').default(false),                            // 是否已读
  createdAt: timestamp('created_at', tz).defaultNow(),                  // 创建时间
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
  stockFundamentals,
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
  StockFundamental,
  NewStockFundamental,
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
