import { pgTable, serial, varchar, integer, numeric, timestamp, unique } from 'drizzle-orm/pg-core'
import { users } from './schema'

export const paperWallets = pgTable('paper_wallets', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }).notNull(),
  market: varchar('market', { length: 10 }).notNull(), // CN / HK / US
  currency: varchar('currency', { length: 10 }).notNull(), // CNY / HKD / USD
  initialBalance: numeric('initial_balance', { precision: 18, scale: 2 }).notNull(),
  cash: numeric('cash', { precision: 18, scale: 2 }).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

export const paperPositions = pgTable('paper_positions', {
  id: serial('id').primaryKey(),
  walletId: integer('wallet_id').notNull().references(() => paperWallets.id, { onDelete: 'cascade' }),
  stockCode: varchar('stock_code', { length: 20 }).notNull(),
  stockName: varchar('stock_name', { length: 200 }),
  market: varchar('market', { length: 10 }).notNull(),
  quantity: numeric('quantity', { precision: 18, scale: 4 }).notNull(),
  avgCost: numeric('avg_cost', { precision: 18, scale: 4 }).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  unique: unique('positions_wallet_stock_unique').on(table.walletId, table.stockCode),
}))

export const paperOrders = pgTable('paper_orders', {
  id: serial('id').primaryKey(),
  walletId: integer('wallet_id').notNull().references(() => paperWallets.id, { onDelete: 'cascade' }),
  stockCode: varchar('stock_code', { length: 20 }).notNull(),
  stockName: varchar('stock_name', { length: 200 }),
  side: varchar('side', { length: 10 }).notNull(), // buy / sell
  quantity: numeric('quantity', { precision: 18, scale: 4 }).notNull(),
  price: numeric('price', { precision: 18, scale: 4 }).notNull(),
  amount: numeric('amount', { precision: 18, scale: 2 }).notNull(),
  fee: numeric('fee', { precision: 18, scale: 2 }).default('0'),
  status: varchar('status', { length: 20 }).notNull().default('filled'), // filled / cancelled
  filledAt: timestamp('filled_at').defaultNow(),
  createdAt: timestamp('created_at').defaultNow(),
})

export type PaperWallet = typeof paperWallets.$inferSelect
export type NewPaperWallet = typeof paperWallets.$inferInsert
export type PaperPosition = typeof paperPositions.$inferSelect
export type NewPaperPosition = typeof paperPositions.$inferInsert
export type PaperOrder = typeof paperOrders.$inferSelect
export type NewPaperOrder = typeof paperOrders.$inferInsert
