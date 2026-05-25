import { pgTable, serial, text, timestamp, varchar, boolean } from 'drizzle-orm/pg-core'

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
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type WatchlistGroup = typeof watchlistGroups.$inferSelect
export type NewWatchlistGroup = typeof watchlistGroups.$inferInsert
export type WatchlistItem = typeof watchlistItems.$inferSelect
export type NewWatchlistItem = typeof watchlistItems.$inferInsert
