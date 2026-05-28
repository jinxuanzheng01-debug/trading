import { Hono } from 'hono'
import { eq, desc, sql } from 'drizzle-orm'
import { db } from '../db'
import { paperWallets, paperPositions, paperOrders } from '../db/schema'
import { authMiddleware } from '../middleware/auth'

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
    userId: user.id,
    name: body.name,
    market: body.market,
    currency,
    initialBalance: String(body.initial_balance),
    cash: String(body.initial_balance),
  }).returning()

  return c.json({ data: wallet })
})

// GET /api/paper/wallets
app.get('/wallets', async (c) => {
  const user = c.get('user') as any
  const wallets = await db.select().from(paperWallets)
    .where(eq(paperWallets.userId, user.id))
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
        const data = await res.json()
        const lastPrice = data?.price || avg
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

  return c.json({ data: results })
})

// GET /api/paper/wallets/:id
app.get('/wallets/:id', async (c) => {
  const user = c.get('user') as any
  const id = Number(c.req.param('id'))

  const wallet = await db.select().from(paperWallets)
    .where(sql`${paperWallets.id} = ${id} AND ${paperWallets.userId} = ${user.id}`)
    .limit(1)

  if (!wallet.length) return c.json({ error: 'Wallet not found' }, 404)

  const positions = await db.select().from(paperPositions)
    .where(eq(paperPositions.walletId, id))

  const marketDataBase = process.env.MARKET_DATA_API_BASE || 'http://localhost:8000'
  let positionsValue = 0
  for (const pos of positions) {
    try {
      const res = await fetch(`${marketDataBase}/api/quote?symbol=${pos.stockCode}`)
      const data = await res.json()
      positionsValue += Number(pos.quantity) * (data?.price || Number(pos.avgCost))
    } catch {
      positionsValue += Number(pos.quantity) * Number(pos.avgCost)
    }
  }

  return c.json({
    data: {
      ...wallet[0],
      cash: Number(wallet[0].cash),
      positionsValue,
      totalAssets: Number(wallet[0].cash) + positionsValue,
      initialBalance: Number(wallet[0].initialBalance),
    },
  })
})

// DELETE /api/paper/wallets/:id
app.delete('/wallets/:id', async (c) => {
  const user = c.get('user') as any
  const id = Number(c.req.param('id'))

  await db.delete(paperWallets)
    .where(sql`${paperWallets.id} = ${id} AND ${paperWallets.userId} = ${user.id}`)

  return c.json({ data: { id } })
})

// POST /api/paper/wallets/:id/reset
app.post('/wallets/:id/reset', async (c) => {
  const user = c.get('user') as any
  const id = Number(c.req.param('id'))

  const [wallet] = await db.select().from(paperWallets)
    .where(sql`${paperWallets.id} = ${id} AND ${paperWallets.userId} = ${user.id}`)
    .limit(1)

  if (!wallet) return c.json({ error: 'Wallet not found' }, 404)

  await db.delete(paperPositions).where(eq(paperPositions.walletId, id))
  await db.delete(paperOrders).where(eq(paperOrders.walletId, id))
  await db.update(paperWallets)
    .set({ cash: String(wallet.initialBalance), updatedAt: new Date() })
    .where(eq(paperWallets.id, id))

  return c.json({ data: { message: 'Wallet reset', cash: Number(wallet.initialBalance) } })
})

// --- Orders ---

// POST /api/paper/wallets/:id/orders — place market order
app.post('/wallets/:id/orders', async (c) => {
  const user = c.get('user') as any
  const walletId = Number(c.req.param('id'))
  const body = await c.req.json<{ stock_code: string; side: 'buy' | 'sell'; quantity: number }>()

  const [wallet] = await db.select().from(paperWallets)
    .where(sql`${paperWallets.id} = ${walletId} AND ${paperWallets.userId} = ${user.id}`)
    .limit(1)

  if (!wallet) return c.json({ error: 'Wallet not found' }, 404)

  const marketDataBase = process.env.MARKET_DATA_API_BASE || 'http://localhost:8000'

  // Get live price from market-data
  let fillPrice = 0
  let stockName = ''
  try {
    const res = await fetch(`${marketDataBase}/api/quote?symbol=${body.stock_code}`)
    const data = await res.json()
    fillPrice = data?.price || 0
    stockName = data?.name || ''
  } catch {
    return c.json({ error: 'Failed to fetch quote' }, 500)
  }

  if (!fillPrice || fillPrice <= 0) {
    return c.json({ error: 'Invalid quote price' }, 400)
  }

  const quantity = body.quantity
  const amount = fillPrice * quantity
  const cash = Number(wallet.cash)

  if (body.side === 'buy') {
    if (cash < amount) {
      return c.json({ error: `Insufficient cash. Need ${amount}, have ${cash}` }, 400)
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

    if (!position) return c.json({ error: 'No position for this stock' }, 400)
    if (Number(position.quantity) < quantity) return c.json({ error: 'Insufficient position quantity' }, 400)

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

  return c.json({
    data: {
      order,
      position: updatedPosition || null,
      wallet: { ...updatedWallet, cash: Number(updatedWallet.cash) },
    },
  })
})

// GET /api/paper/wallets/:id/orders
app.get('/wallets/:id/orders', async (c) => {
  const user = c.get('user') as any
  const walletId = Number(c.req.param('id'))
  const limit = Number(c.req.query('limit') || 50)

  const orders = await db.select().from(paperOrders)
    .where(sql`${paperOrders.walletId} = ${walletId} AND ${paperOrders.walletId} IN (SELECT id FROM ${paperWallets} WHERE user_id = ${user.id})`)
    .orderBy(desc(paperOrders.createdAt))
    .limit(limit)

  return c.json({ data: orders })
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
      const data = await res.json()
      if (data?.price) lastPrice = data.price
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

  return c.json({ data: positionsWithPnl })
})

// POST /api/paper/wallets/:id/positions — manual position entry
app.post('/wallets/:id/positions', async (c) => {
  const user = c.get('user') as any
  const walletId = Number(c.req.param('id'))
  const body = await c.req.json<{ stock_code: string; quantity: number; avg_cost: number }>()

  const [wallet] = await db.select().from(paperWallets)
    .where(sql`${paperWallets.id} = ${walletId} AND ${paperWallets.userId} = ${user.id}`)
    .limit(1)

  if (!wallet) return c.json({ error: 'Wallet not found' }, 404)

  const marketDataBase = process.env.MARKET_DATA_API_BASE || 'http://localhost:8000'

  let stockName = ''
  try {
    const res = await fetch(`${marketDataBase}/api/quote?symbol=${body.stock_code}`)
    const data = await res.json()
    stockName = data?.name || ''
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
    return c.json({ data: updated })
  }

  const [position] = await db.insert(paperPositions).values({
    walletId,
    stockCode: body.stock_code,
    stockName,
    market: wallet.market,
    quantity: String(body.quantity),
    avgCost: String(body.avg_cost),
  }).returning()

  return c.json({ data: position })
})

export { app as paper }
