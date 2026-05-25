import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db'
import { watchlistGroups, watchlistItems } from '../db/schema'
import { authMiddleware } from '../middleware/auth'
import { eq, and } from 'drizzle-orm'
import '../types/hono'

const watchlist = new Hono()

// Apply auth middleware to all routes
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
  name: z.string().max(100).optional(),
  type: z.enum(['stock', 'etf', 'index', 'crypto']).default('stock'),
  exchange: z.string().max(20).optional(),
  notes: z.string().optional(),
})

const updateItemSchema = z.object({
  symbol: z.string().min(1).max(20).optional(),
  name: z.string().max(100).optional(),
  type: z.enum(['stock', 'etf', 'index', 'crypto']).optional(),
  exchange: z.string().max(20).optional(),
  notes: z.string().optional(),
})

// GET /api/watchlist/groups - Get user's groups
watchlist.get('/groups', async (c) => {
  const user = c.get('user')

  const groups = await db.select().from(watchlistGroups)
    .where(eq(watchlistGroups.userId, user.userId))

  return c.json(groups)
})

// POST /api/watchlist/groups - Create group
watchlist.post('/groups', zValidator('json', createGroupSchema), async (c) => {
  const user = c.get('user')
  const { name, description } = c.req.valid('json')

  const [group] = await db.insert(watchlistGroups).values({
    userId: user.userId,
    name,
    description,
  }).returning()

  return c.json(group, 201)
})

// PUT /api/watchlist/groups/:id - Update group
watchlist.put('/groups/:id', zValidator('json', updateGroupSchema), async (c) => {
  const user = c.get('user')
  const id = Number(c.req.param('id'))
  const updates = c.req.valid('json')

  // Verify ownership
  const [existing] = await db.select().from(watchlistGroups)
    .where(and(eq(watchlistGroups.id, id), eq(watchlistGroups.userId, user.userId)))
    .limit(1)

  if (!existing) {
    return c.json({ error: 'Group not found' }, 404)
  }

  const [updated] = await db.update(watchlistGroups)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(watchlistGroups.id, id))
    .returning()

  return c.json(updated)
})

// DELETE /api/watchlist/groups/:id - Delete group
watchlist.delete('/groups/:id', async (c) => {
  const user = c.get('user')
  const id = Number(c.req.param('id'))

  // Verify ownership
  const [existing] = await db.select().from(watchlistGroups)
    .where(and(eq(watchlistGroups.id, id), eq(watchlistGroups.userId, user.userId)))
    .limit(1)

  if (!existing) {
    return c.json({ error: 'Group not found' }, 404)
  }

  await db.delete(watchlistGroups).where(eq(watchlistGroups.id, id))

  return c.json({ success: true })
})

// GET /api/watchlist/groups/:id/items - Get group items
watchlist.get('/groups/:id/items', async (c) => {
  const user = c.get('user')
  const id = Number(c.req.param('id'))

  // Verify ownership
  const [group] = await db.select().from(watchlistGroups)
    .where(and(eq(watchlistGroups.id, id), eq(watchlistGroups.userId, user.userId)))
    .limit(1)

  if (!group) {
    return c.json({ error: 'Group not found' }, 404)
  }

  const items = await db.select().from(watchlistItems)
    .where(eq(watchlistItems.groupId, id))

  return c.json(items)
})

// POST /api/watchlist/groups/:id/items - Add item to group
watchlist.post('/groups/:id/items', zValidator('json', addItemSchema), async (c) => {
  const user = c.get('user')
  const id = Number(c.req.param('id'))
  const data = c.req.valid('json')

  // Verify ownership
  const [group] = await db.select().from(watchlistGroups)
    .where(and(eq(watchlistGroups.id, id), eq(watchlistGroups.userId, user.userId)))
    .limit(1)

  if (!group) {
    return c.json({ error: 'Group not found' }, 404)
  }

  const [item] = await db.insert(watchlistItems).values({
    groupId: id,
    ...data,
  }).returning()

  return c.json(item, 201)
})

// PUT /api/watchlist/items/:id - Update item
watchlist.put('/items/:id', zValidator('json', updateItemSchema), async (c) => {
  const user = c.get('user')
  const id = Number(c.req.param('id'))
  const updates = c.req.valid('json')

  // Verify ownership through group
  const [item] = await db.select({
    item: watchlistItems,
  })
    .from(watchlistItems)
    .innerJoin(watchlistGroups, eq(watchlistItems.groupId, watchlistGroups.id))
    .where(and(eq(watchlistItems.id, id), eq(watchlistGroups.userId, user.userId)))
    .limit(1)

  if (!item) {
    return c.json({ error: 'Item not found' }, 404)
  }

  const [updated] = await db.update(watchlistItems)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(watchlistItems.id, id))
    .returning()

  return c.json(updated)
})

// DELETE /api/watchlist/items/:id - Delete item
watchlist.delete('/items/:id', async (c) => {
  const user = c.get('user')
  const id = Number(c.req.param('id'))

  // Verify ownership through group
  const [item] = await db.select({
    item: watchlistItems,
  })
    .from(watchlistItems)
    .innerJoin(watchlistGroups, eq(watchlistItems.groupId, watchlistGroups.id))
    .where(and(eq(watchlistItems.id, id), eq(watchlistGroups.userId, user.userId)))
    .limit(1)

  if (!item) {
    return c.json({ error: 'Item not found' }, 404)
  }

  await db.delete(watchlistItems).where(eq(watchlistItems.id, id))

  return c.json({ success: true })
})

export { watchlist }
