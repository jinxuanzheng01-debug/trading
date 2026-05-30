import { Hono } from 'hono'
import { eq, desc, sql } from 'drizzle-orm'
import { db } from '../db'
import { paperWallets, paperPositions, paperOrders } from '../db/schema'
import { authMiddleware } from '../middleware/auth'
import { ok, fail, ErrorCode } from '../lib/response'

const app = new Hono()
app.use('*', authMiddleware)

// --- Wallet CRUD ---

// POST /api/paper/wallets
app.post('/wallets', async (c) => {
  const user = c.get('user') as any
  const body = await c.req.json<{ name: string; market: string; initial_balance: number }>()

  const marketCurrency: Record<string, string> = { CN: 'CNY', HK: 'HKD', US: 'USD' }
  const currency = marketCurrency[body.market] || 'USD'

  const [wallet] = await db.insert(paperWallets).values({
    userId: user.userId,
    name: body.name,
    market: body.market,
    currency,
    initialBalance: String(body.initial_balance),
    cash: String(body.initial_balance),
  }).returning()

  return ok(c, wallet)
})

// GET /api/paper/wallets
app.get('/wallets', async (c) => {
  const user = c.get('user') as any
  const wallets = await db.select().from(paperWallets)
    .where(eq(paperWallets.userId, user.userId))
    .orderBy(desc(paperWallets.createdAt))

  const marketDataBase = process.env.MARKET_DATA_API_BASE || 'http://localhost:8000'

  const results = await Promise.all(wallets.map(async (wallet) => {
    const positions = await db.select().from(paperPositions)
      .where(eq(paperPositions.walletId, wallet.id))

    let positionsValue = 0
    let unrealizedPnl = 0

    for (const pos of positions) {
      const qty = Number(pos.quantity)
      const avg = Number(pos.avgCost)
      try {
        const res = await fetch(`${marketDataBase}/api/quote?symbol=${pos.stockCode}`)
        const data: any = await res.json()
        const lastPrice = Number(data?.price) || avg
        positionsValue += qty * lastPrice
        unrealizedPnl += qty * (lastPrice - avg)
      } catch {
        positionsValue += qty * avg
      }
    }

    const cash = Number(wallet.cash)
    const initBalance = Number(wallet.initialBalance)
    const totalAssets = cash + positionsValue

    // Simplified V1: totalPnl = (totalAssets - initBalance)
    const totalPnl = totalAssets - initBalance

    return {
      ...wallet,
      cash,
      positionsValue,
      totalAssets,
      totalPnl,
      positionCount: positions.length,
    }
  }))

  return ok(c, results)
})

// GET /api/paper/wallets/:id
app.get('/wallets/:id', async (c) => {
  const user = c.get('user') as any
  const id = Number(c.req.param('id'))

  const wallet = await db.select().from(paperWallets)
    .where(sql`${paperWallets.id} = ${id} AND ${paperWallets.userId} = ${user.userId}`)
    .limit(1)

  if (!wallet.length) return fail(c, ErrorCode.NOT_FOUND, 'Wallet not found')

  const positions = await db.select().from(paperPositions)
    .where(eq(paperPositions.walletId, id))

  const marketDataBase = process.env.MARKET_DATA_API_BASE || 'http://localhost:8000'
  let positionsValue = 0
  for (const pos of positions) {
    try {
      const res = await fetch(`${marketDataBase}/api/quote?symbol=${pos.stockCode}`)
      const data: any = await res.json()
      positionsValue += Number(pos.quantity) * (Number(data?.price) || Number(pos.avgCost))
    } catch {
      positionsValue += Number(pos.quantity) * Number(pos.avgCost)
    }
  }

  return ok(c, {
    ...wallet[0],
    cash: Number(wallet[0].cash),
    positionsValue,
    totalAssets: Number(wallet[0].cash) + positionsValue,
    initialBalance: Number(wallet[0].initialBalance),
  })
})

// DELETE /api/paper/wallets/:id
app.delete('/wallets/:id', async (c) => {
  const user = c.get('user') as any
  const id = Number(c.req.param('id'))

  await db.delete(paperWallets)
    .where(sql`${paperWallets.id} = ${id} AND ${paperWallets.userId} = ${user.userId}`)

  return ok(c, { id })
})

// POST /api/paper/wallets/:id/reset
app.post('/wallets/:id/reset', async (c) => {
  const user = c.get('user') as any
  const id = Number(c.req.param('id'))

  const [wallet] = await db.select().from(paperWallets)
    .where(sql`${paperWallets.id} = ${id} AND ${paperWallets.userId} = ${user.userId}`)
    .limit(1)

  if (!wallet) return fail(c, ErrorCode.NOT_FOUND, 'Wallet not found')

  await db.delete(paperPositions).where(eq(paperPositions.walletId, id))
  await db.delete(paperOrders).where(eq(paperOrders.walletId, id))
  await db.update(paperWallets)
    .set({ cash: String(wallet.initialBalance), updatedAt: new Date() })
    .where(eq(paperWallets.id, id))

  return ok(c, { message: 'Wallet reset', cash: Number(wallet.initialBalance) })
})

// --- Orders ---

// POST /api/paper/wallets/:id/orders — place market order
app.post('/wallets/:id/orders', async (c) => {
  const user = c.get('user') as any
  const walletId = Number(c.req.param('id'))
  const body = await c.req.json<{ stock_code: string; side: 'buy' | 'sell'; quantity: number }>()

  const [wallet] = await db.select().from(paperWallets)
    .where(sql`${paperWallets.id} = ${walletId} AND ${paperWallets.userId} = ${user.userId}`)
    .limit(1)

  if (!wallet) return fail(c, ErrorCode.NOT_FOUND, 'Wallet not found')

  const marketDataBase = process.env.MARKET_DATA_API_BASE || 'http://localhost:8000'

  // Get live price from market-data
  let fillPrice = 0
  let stockName = ''
  try {
    const res = await fetch(`${marketDataBase}/api/quote?symbol=${body.stock_code}`)
    const data: any = await res.json()
    fillPrice = Number(data?.price) || 0
    stockName = String(data?.name || '')
  } catch {
    return fail(c, ErrorCode.MARKET_DATA_UNAVAILABLE, 'Failed to fetch quote')
  }

  if (!fillPrice || fillPrice <= 0) {
    return fail(c, ErrorCode.BAD_REQUEST, 'Invalid quote price')
  }

  const quantity = body.quantity
  const amount = fillPrice * quantity
  const cash = Number(wallet.cash)

  if (body.side === 'buy') {
    if (cash < amount) {
      return fail(c, ErrorCode.BAD_REQUEST, `Insufficient cash. Need ${amount}, have ${cash}`)
    }

    // Update or create position with weighted avg cost
    const [existing] = await db.select().from(paperPositions)
      .where(sql`${paperPositions.walletId} = ${walletId} AND ${paperPositions.stockCode} = ${body.stock_code}`)
      .limit(1)

    if (existing) {
      const oldQty = Number(existing.quantity)
      const oldCost = Number(existing.avgCost)
      const newQty = oldQty + quantity
      const newAvgCost = (oldQty * oldCost + quantity * fillPrice) / newQty

      await db.update(paperPositions)
        .set({ quantity: String(newQty), avgCost: String(newAvgCost), updatedAt: new Date() })
        .where(eq(paperPositions.id, existing.id))
    } else {
      await db.insert(paperPositions).values({
        walletId,
        stockCode: body.stock_code,
        stockName,
        market: wallet.market,
        quantity: String(quantity),
        avgCost: String(fillPrice),
      })
    }

    await db.update(paperWallets)
      .set({ cash: String(cash - amount), updatedAt: new Date() })
      .where(eq(paperWallets.id, walletId))
  } else {
    const [position] = await db.select().from(paperPositions)
      .where(sql`${paperPositions.walletId} = ${walletId} AND ${paperPositions.stockCode} = ${body.stock_code}`)
      .limit(1)

    if (!position) return fail(c, ErrorCode.BAD_REQUEST, 'No position for this stock')
    if (Number(position.quantity) < quantity) return fail(c, ErrorCode.BAD_REQUEST, 'Insufficient position quantity')

    const remaining = Number(position.quantity) - quantity
    if (remaining <= 0) {
      await db.delete(paperPositions).where(eq(paperPositions.id, position.id))
    } else {
      await db.update(paperPositions)
        .set({ quantity: String(remaining), updatedAt: new Date() })
        .where(eq(paperPositions.id, position.id))
    }

    await db.update(paperWallets)
      .set({ cash: String(cash + amount), updatedAt: new Date() })
      .where(eq(paperWallets.id, walletId))
  }

  // Record order
  const [order] = await db.insert(paperOrders).values({
    walletId,
    stockCode: body.stock_code,
    stockName,
    side: body.side,
    quantity: String(quantity),
    price: String(fillPrice),
    amount: String(amount),
  }).returning()

  const [updatedWallet] = await db.select().from(paperWallets).where(eq(paperWallets.id, walletId)).limit(1)
  const [updatedPosition] = await db.select().from(paperPositions)
    .where(sql`${paperPositions.walletId} = ${walletId} AND ${paperPositions.stockCode} = ${body.stock_code}`)
    .limit(1)

  return ok(c, {
    order,
    position: updatedPosition || null,
    wallet: { ...updatedWallet, cash: Number(updatedWallet.cash) },
  })
})

// GET /api/paper/wallets/:id/orders
app.get('/wallets/:id/orders', async (c) => {
  const user = c.get('user') as any
  const walletId = Number(c.req.param('id'))
  const limit = Number(c.req.query('limit') || 50)

  const orders = await db.select().from(paperOrders)
    .where(sql`${paperOrders.walletId} = ${walletId} AND ${paperOrders.walletId} IN (SELECT id FROM ${paperWallets} WHERE user_id = ${user.userId})`)
    .orderBy(desc(paperOrders.createdAt))
    .limit(limit)

  return ok(c, orders)
})

// --- Positions ---

// GET /api/paper/wallets/:id/positions
app.get('/wallets/:id/positions', async (c) => {
  const user = c.get('user') as any
  const walletId = Number(c.req.param('id'))

  const positions = await db.select().from(paperPositions)
    .where(eq(paperPositions.walletId, walletId))

  const marketDataBase = process.env.MARKET_DATA_API_BASE || 'http://localhost:8000'

  const positionsWithPnl = await Promise.all(positions.map(async (pos) => {
    let lastPrice = Number(pos.avgCost)
    try {
      const res = await fetch(`${marketDataBase}/api/quote?symbol=${pos.stockCode}`)
      const data: any = await res.json()
      if (data?.price) lastPrice = Number(data.price)
    } catch { /* use cost as fallback */ }

    const qty = Number(pos.quantity)
    const avg = Number(pos.avgCost)
    return {
      ...pos,
      quantity: qty,
      avgCost: avg,
      lastPrice,
      marketValue: qty * lastPrice,
      unrealizedPnl: qty * (lastPrice - avg),
      unrealizedPnlPercent: avg > 0 ? ((lastPrice - avg) / avg) * 100 : 0,
    }
  }))

  return ok(c, positionsWithPnl)
})

// POST /api/paper/wallets/:id/positions — manual position entry
app.post('/wallets/:id/positions', async (c) => {
  const user = c.get('user') as any
  const walletId = Number(c.req.param('id'))
  const body = await c.req.json<{ stock_code: string; quantity: number; avg_cost: number }>()

  const [wallet] = await db.select().from(paperWallets)
    .where(sql`${paperWallets.id} = ${walletId} AND ${paperWallets.userId} = ${user.userId}`)
    .limit(1)

  if (!wallet) return fail(c, ErrorCode.NOT_FOUND, 'Wallet not found')

  const marketDataBase = process.env.MARKET_DATA_API_BASE || 'http://localhost:8000'

  let stockName = ''
  try {
    const res = await fetch(`${marketDataBase}/api/quote?symbol=${body.stock_code}`)
    const data: any = await res.json()
    stockName = String(data?.name || '')
  } catch { /* ignore */ }

  const [existing] = await db.select().from(paperPositions)
    .where(sql`${paperPositions.walletId} = ${walletId} AND ${paperPositions.stockCode} = ${body.stock_code}`)
    .limit(1)

  if (existing) {
    const [updated] = await db.update(paperPositions)
      .set({
        quantity: String(body.quantity),
        avgCost: String(body.avg_cost),
        stockName: stockName || existing.stockName,
        updatedAt: new Date(),
      })
      .where(eq(paperPositions.id, existing.id))
      .returning()
    return ok(c, updated)
  }

  const [position] = await db.insert(paperPositions).values({
    walletId,
    stockCode: body.stock_code,
    stockName,
    market: wallet.market,
    quantity: String(body.quantity),
    avgCost: String(body.avg_cost),
  }).returning()

  return ok(c, position)
})

export { app as paper }
