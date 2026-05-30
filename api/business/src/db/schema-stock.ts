import { pgTable, serial, varchar, integer, bigint, decimal, timestamp, index, primaryKey } from 'drizzle-orm/pg-core'

const tz = { withTimezone: true } as const

// 股票基础信息（全量美股目录，NASDAQ/NYSE 官方 listing 导入）
export const stocks = pgTable('stocks', {
  id: serial('id').primaryKey(),                                        // 内部ID
  symbol: varchar('symbol', { length: 20 }).notNull().unique(),         // 股票代码（如 AAPL）
  name: varchar('name', { length: 200 }),                               // 英文名称
  name_cn: varchar('name_cn', { length: 100 }),                         // 中文名称
  exchange: varchar('exchange', { length: 20 }),                        // 交易所：NASDAQ / NYSE / NYSE American / BATS
  market: varchar('market', { length: 20 }),                            // 市场：US / CN / HK
  type: varchar('type', { length: 20 }).default('stock'),               // 类型：stock / ETF
  sector: varchar('sector', { length: 100 }),                           // 行业板块（从 yfinance 补全）
  industry: varchar('industry', { length: 100 }),                       // 细分行业（从 yfinance 补全）
  listing_date: timestamp('listing_date', tz),                         // 上市日期（从 yfinance 补全）
  created_at: timestamp('created_at', tz).defaultNow(),                 // 入库时间
  updated_at: timestamp('updated_at', tz).defaultNow(),                 // 更新时间
})

// 最新行情快照（每个 stock 唯一一行，UPSERT 更新）
export const stockQuotes = pgTable('stock_quotes', {
  stockId: integer('stock_id').primaryKey().references(() => stocks.id), // 关联股票
  price: decimal('price', { precision: 12, scale: 4 }),                 // 最新价
  change: decimal('change', { precision: 12, scale: 4 }),               // 涨跌额
  changePercent: decimal('change_percent', { precision: 8, scale: 4 }), // 涨跌幅 %
  open: decimal('open', { precision: 12, scale: 4 }),                   // 开盘价
  high: decimal('high', { precision: 12, scale: 4 }),                   // 最高价
  low: decimal('low', { precision: 12, scale: 4 }),                     // 最低价
  volume: bigint('volume', { mode: 'number' }),                         // 成交量
  prevClose: decimal('prev_close', { precision: 12, scale: 4 }),        // 昨收价
  marketCap: bigint('market_cap', { mode: 'number' }),                  // 市值
  currency: varchar('currency', { length: 10 }).default('USD'),         // 货币
  turnoverRate: decimal('turnover_rate', { precision: 8, scale: 4 }),   // 换手率
  amount: bigint('amount', { mode: 'number' }),                         // 成交额
  timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),  // 数据时间戳
  dataDate: timestamp('data_date', tz).notNull(),                       // 数据日期
  updatedAt: timestamp('updated_at', tz).defaultNow(),                  // 更新时间
})

// 历史行情快照（每次刷新报价 append 一条，保留盘中价格变化轨迹）
export const quoteSnapshots = pgTable('quote_snapshots', {
  id: serial('id').primaryKey(),                                        // 快照ID
  stockId: integer('stock_id').references(() => stocks.id).notNull(),   // 关联股票
  price: decimal('price', { precision: 12, scale: 4 }),                 // 价格
  change: decimal('change', { precision: 12, scale: 4 }),               // 涨跌额
  changePercent: decimal('change_percent', { precision: 8, scale: 4 }), // 涨跌幅 %
  volume: bigint('volume', { mode: 'number' }),                         // 成交量
  timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),  // 快照时间
}, (table) => ({
  stockTimestampIdx: index('quote_snapshots_stock_ts_idx').on(table.stockId, table.timestamp),
}))

// K线数据 — 只存日线，TimescaleDB hypertable
// 主键 = (stock_id, timestamp)，TimescaleDB 要求分区列在主键中
// 周线/月线由 continuous aggregate 派生
export const klines = pgTable('klines', {
  stockId: integer('stock_id').references(() => stocks.id).notNull(),   // 关联股票
  timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),  // K线日期
  open: decimal('open', { precision: 12, scale: 4 }),                   // 开盘价
  high: decimal('high', { precision: 12, scale: 4 }),                   // 最高价
  low: decimal('low', { precision: 12, scale: 4 }),                     // 最低价
  close: decimal('close', { precision: 12, scale: 4 }),                 // 收盘价
  volume: bigint('volume', { mode: 'number' }),                         // 成交量（股）
  amount: bigint('amount', { mode: 'number' }),                         // 成交额
  preClose: decimal('pre_close', { precision: 12, scale: 4 }),          // 前收盘价
  change: decimal('change', { precision: 12, scale: 4 }),               // 涨跌额
  changePercent: decimal('change_percent', { precision: 8, scale: 4 }), // 涨跌幅 %
  turnoverRate: decimal('turnover_rate', { precision: 8, scale: 4 }),   // 换手率
  dataSource: varchar('data_source', { length: 20 }).default('yfinance'), // 数据来源
}, (table) => ({
  pk: primaryKey({ columns: [table.stockId, table.timestamp] }),
  stockIdx: index('klines_stock_idx').on(table.stockId),
  timestampIdx: index('klines_timestamp_idx').on(table.timestamp),
}))

// 基本面数据（市盈率、市值等，scheduler 每天同步一次）
export const stockFundamentals = pgTable('stock_fundamentals', {
  stockId: integer('stock_id').primaryKey().references(() => stocks.id),
  marketCap: bigint('market_cap', { mode: 'number' }),
  trailingPE: decimal('trailing_pe', { precision: 12, scale: 4 }),
  forwardPE: decimal('forward_pe', { precision: 12, scale: 4 }),
  priceToBook: decimal('price_to_book', { precision: 8, scale: 4 }),
  beta: decimal('beta', { precision: 6, scale: 4 }),
  fiftyTwoWeekHigh: decimal('fifty_two_week_high', { precision: 12, scale: 4 }),
  fiftyTwoWeekLow: decimal('fifty_two_week_low', { precision: 12, scale: 4 }),
  dividendYield: decimal('dividend_yield', { precision: 8, scale: 4 }),
  eps: decimal('eps', { precision: 12, scale: 4 }),
  sharesOutstanding: bigint('shares_outstanding', { mode: 'number' }),
  updatedAt: timestamp('updated_at', tz).defaultNow(),
})

// Types
export type Stock = typeof stocks.$inferSelect
export type NewStock = typeof stocks.$inferInsert
export type StockQuote = typeof stockQuotes.$inferSelect
export type NewStockQuote = typeof stockQuotes.$inferInsert
export type QuoteSnapshot = typeof quoteSnapshots.$inferSelect
export type NewQuoteSnapshot = typeof quoteSnapshots.$inferInsert
export type Kline = typeof klines.$inferSelect
export type NewKline = typeof klines.$inferInsert
export type StockFundamental = typeof stockFundamentals.$inferSelect
export type NewStockFundamental = typeof stockFundamentals.$inferInsert
