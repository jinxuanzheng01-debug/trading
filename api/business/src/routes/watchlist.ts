import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db'
import { watchlistGroups, watchlistItems, stocks } from '../db/schema'
import { authMiddleware } from '../middleware/auth'
import { eq, and } from 'drizzle-orm'
import { getQuotes } from '../lib/market-data-client'
import { ok, fail, ErrorCode } from '../lib/response'
import { publishWatchlistAdded } from '../queue/watchlist-events'
import '../types/hono'

const watchlist = new Hono()

watchlist.use('*', authMiddleware)

const createGroupSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
})

const updateGroupSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
})

const addItemSchema = z.object({
  symbol: z.string().min(1).max(20),
})

const updateItemSchema = z.object({
  symbol: z.string().min(1).max(20).optional(),
  name: z.string().max(100).optional(),
  type: z.enum(['stock', 'etf', 'index', 'crypto']).optional(),
  exchange: z.string().max(20).optional(),
  notes: z.string().optional(),
})

const reorderSchema = z.object({
  itemIds: z.array(z.number())
})

// GET /api/watchlist/groups - Get user's groups
watchlist.get('/groups', async (c) => {
  const user = c.get('user')
  const groups = await db.select().from(watchlistGroups)
    .where(eq(watchlistGroups.userId, user.userId))
  return ok(c, groups)
})

// POST /api/watchlist/groups - Create group
watchlist.post('/groups', zValidator('json', createGroupSchema), async (c) => {
  const user = c.get('user')
  const { name, description } = c.req.valid('json')
  const [group] = await db.insert(watchlistGroups).values({
    userId: user.userId, name, description,
  }).returning()
  return ok(c, group, '创建成功')
})

// PUT /api/watchlist/groups/:id - Update group
watchlist.put('/groups/:id', zValidator('json', updateGroupSchema), async (c) => {
  const user = c.get('user')
  const id = Number(c.req.param('id'))
  const updates = c.req.valid('json')

  const [existing] = await db.select().from(watchlistGroups)
    .where(and(eq(watchlistGroups.id, id), eq(watchlistGroups.userId, user.userId)))
    .limit(1)

  if (!existing) return fail(c, ErrorCode.GROUP_NOT_FOUND)

  const [updated] = await db.update(watchlistGroups)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(watchlistGroups.id, id))
    .returning()

  return ok(c, updated)
})

// DELETE /api/watchlist/groups/:id - Delete group
watchlist.delete('/groups/:id', async (c) => {
  const user = c.get('user')
  const id = Number(c.req.param('id'))

  const [existing] = await db.select().from(watchlistGroups)
    .where(and(eq(watchlistGroups.id, id), eq(watchlistGroups.userId, user.userId)))
    .limit(1)

  if (!existing) return fail(c, ErrorCode.GROUP_NOT_FOUND)

  await db.delete(watchlistGroups).where(eq(watchlistGroups.id, id))
  return ok(c, null, '删除成功')
})

// GET /api/watchlist/groups/:id/items - Get group items
watchlist.get('/groups/:id/items', async (c) => {
  const user = c.get('user')
  const id = Number(c.req.param('id'))

  const [group] = await db.select().from(watchlistGroups)
    .where(and(eq(watchlistGroups.id, id), eq(watchlistGroups.userId, user.userId)))
    .limit(1)

  if (!group) return fail(c, ErrorCode.GROUP_NOT_FOUND)

  const items = await db
    .select({
      id: watchlistItems.id,
      groupId: watchlistItems.groupId,
      stockId: watchlistItems.stockId,
      symbol: stocks.symbol,
      name: stocks.name,
      nameCn: stocks.name_cn,
      exchange: stocks.exchange,
      market: stocks.market,
      type: stocks.type,
      sortOrder: watchlistItems.sort_order,
      notes: watchlistItems.notes,
      createdAt: watchlistItems.createdAt,
      updatedAt: watchlistItems.updatedAt,
    })
    .from(watchlistItems)
    .innerJoin(stocks, eq(watchlistItems.stockId, stocks.id))
    .where(eq(watchlistItems.groupId, id))
    .orderBy(watchlistItems.sort_order, watchlistItems.createdAt)

  return ok(c, items)
})

// POST /api/watchlist/groups/:id/items - Add item to group
watchlist.post('/groups/:id/items', zValidator('json', addItemSchema), async (c) => {
  const user = c.get('user')
  const id = Number(c.req.param('id'))
  const data = c.req.valid('json')

  const [group] = await db.select().from(watchlistGroups)
    .where(and(eq(watchlistGroups.id, id), eq(watchlistGroups.userId, user.userId)))
    .limit(1)

  if (!group) return fail(c, ErrorCode.GROUP_NOT_FOUND)

  const symbol = data.symbol.toUpperCase()

  // 从 market-data 验证股票代码并获取信息
  let stockInfo: { name?: string; exchange?: string; type?: string } = {}
  try {
    const quotes = await getQuotes([data.symbol])
    if (quotes.length > 0 && quotes[0].price > 0) {
      stockInfo.name = quotes[0].name
      stockInfo.exchange = quotes[0].exchange
      stockInfo.type = quotes[0].type || 'stock'
    } else {
      return fail(c, ErrorCode.STOCK_NOT_FOUND)
    }
  } catch (error) {
    console.error('Failed to fetch stock info:', error)
    return fail(c, ErrorCode.STOCK_NOT_FOUND)
  }

  // 查/写 stocks 表
  await db.insert(stocks).values({
    symbol,
    name: stockInfo.name || null,
    exchange: stockInfo.exchange || null,
    type: stockInfo.type || 'stock',
  }).onConflictDoUpdate({
    target: stocks.symbol,
    set: { name: stockInfo.name || null, exchange: stockInfo.exchange || null, updated_at: new Date() },
  })

  const [stock] = await db.select({ id: stocks.id }).from(stocks).where(eq(stocks.symbol, symbol)).limit(1)

  // 检查是否已存在该 stock_id
  const [existing] = await db.select().from(watchlistItems)
    .where(and(eq(watchlistItems.groupId, id), eq(watchlistItems.stockId, stock!.id)))
    .limit(1)

  if (existing) return fail(c, ErrorCode.STOCK_ALREADY_EXISTS)

  const [item] = await db.insert(watchlistItems).values({
    groupId: id,
    stockId: stock!.id,
  }).returning()

  // 发布事件到 Redis Stream
  publishWatchlistAdded(symbol).catch(err =>
    console.error('Failed to publish watchlist event:', err)
  )

  return ok(c, item, '添加成功')
})

// PUT /api/watchlist/items/:id - Update item
watchlist.put('/items/:id', zValidator('json', updateItemSchema), async (c) => {
  const user = c.get('user')
  const id = Number(c.req.param('id'))
  const updates = c.req.valid('json')

  const [item] = await db.select({ item: watchlistItems })
    .from(watchlistItems)
    .innerJoin(watchlistGroups, eq(watchlistItems.groupId, watchlistGroups.id))
    .where(and(eq(watchlistItems.id, id), eq(watchlistGroups.userId, user.userId)))
    .limit(1)

  if (!item) return fail(c, ErrorCode.ITEM_NOT_FOUND)

  const [updated] = await db.update(watchlistItems)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(watchlistItems.id, id))
    .returning()

  return ok(c, updated)
})

// DELETE /api/watchlist/items/:id - Delete item
watchlist.delete('/items/:id', async (c) => {
  const user = c.get('user')
  const id = Number(c.req.param('id'))

  const [item] = await db.select({ item: watchlistItems })
    .from(watchlistItems)
    .innerJoin(watchlistGroups, eq(watchlistItems.groupId, watchlistGroups.id))
    .where(and(eq(watchlistItems.id, id), eq(watchlistGroups.userId, user.userId)))
    .limit(1)

  if (!item) return fail(c, ErrorCode.ITEM_NOT_FOUND)

  await db.delete(watchlistItems).where(eq(watchlistItems.id, id))
  return ok(c, null, '删除成功')
})

// PUT /api/watchlist/groups/:groupId/reorder - Reorder items in group
watchlist.put('/groups/:groupId/reorder', zValidator('json', reorderSchema), async (c) => {
  const user = c.get('user')
  const groupId = Number(c.req.param('groupId'))
  const { itemIds } = c.req.valid('json')

  const [group] = await db.select().from(watchlistGroups)
    .where(and(eq(watchlistGroups.id, groupId), eq(watchlistGroups.userId, user.userId)))
    .limit(1)

  if (!group) return fail(c, ErrorCode.GROUP_NOT_FOUND)

  const existingItems = await db.select({ id: watchlistItems.id })
    .from(watchlistItems)
    .where(eq(watchlistItems.groupId, groupId))

  const existingIds = new Set(existingItems.map(i => i.id))
  for (const id of itemIds) {
    if (!existingIds.has(id)) {
      return fail(c, ErrorCode.REORDER_INVALID, `自选股 ${id} 不存在于该分组`)
    }
  }

  for (let i = 0; i < itemIds.length; i++) {
    await db.update(watchlistItems)
      .set({ sort_order: i, updatedAt: new Date() })
      .where(eq(watchlistItems.id, itemIds[i]))
  }

  return ok(c, null, '排序成功')
})

export { watchlist }
