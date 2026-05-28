# Paper Trading Multi-Wallet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-wallet paper trading (buy/sell with virtual cash, track P&L) to the Trading-agent platform.

**Architecture:** New Drizzle schema (`schema-paper.ts`) for wallets/positions/orders, a Hono route handler (`paper.ts`) with 8 endpoints, a Nuxt composable (`usePaper.ts`) + 3 frontend pages, sidebar menu entry, and dashboard asset overview card.

**Tech Stack:** PostgreSQL + Drizzle ORM, Hono (TypeScript backend), Nuxt 4 + Vue 3 + shadcn-vue + TailwindCSS 4 (frontend)

---

### Task 1: Database Schema

**Files:**
- Create: `api/business/src/db/schema-paper.ts`
- Modify: `api/business/src/db/schema.ts`

- [ ] **Step 1: Create the paper trading schema file**

```typescript
// api/business/src/db/schema-paper.ts
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
```

- [ ] **Step 2: Re-export new tables from schema.ts**

Add to the end of `api/business/src/db/schema.ts`:

```typescript
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
```

- [ ] **Step 3: Generate and run migration**

```bash
cd /Users/xuan/Documents/Trading-agent && pnpm db:push
```

- [ ] **Step 4: Commit**

```bash
cd /Users/xuan/Documents/Trading-agent
git add api/business/src/db/schema-paper.ts api/business/src/db/schema.ts
git commit -m "feat: add paper trading schema (wallets, positions, orders)"
```

---

### Task 2: Paper Trading API Routes

**Files:**
- Create: `api/business/src/routes/paper.ts`
- Modify: `api/business/src/index.ts`

- [ ] **Step 1: Create the paper route handler**

```typescript
// api/business/src/routes/paper.ts
import { Hono } from 'hono'
import { eq, desc, sql } from 'drizzle-orm'
import { db } from '../db'
import { paperWallets, paperPositions, paperOrders } from '../db/schema'
import type { NewPaperWallet, NewPaperOrder } from '../db/schema-paper'
import { authMiddleware } from '../middleware/auth'

const app = new Hono()
app.use('*', authMiddleware)

// --- Wallet CRUD ---

// POST /api/paper/wallets — create wallet
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

// GET /api/paper/wallets — list wallets with total assets
app.get('/wallets', async (c) => {
  const user = c.get('user') as any
  const wallets = await db.select().from(paperWallets)
    .where(eq(paperWallets.userId, user.id))
    .orderBy(desc(paperWallets.createdAt))

  // Calculate total assets and P&L for each wallet
  const results = await Promise.all(wallets.map(async (wallet) => {
    const positions = await db.select().from(paperPositions)
      .where(eq(paperPositions.walletId, wallet.id))

    // Try to fetch live prices and calculate P&L
    let positionsValue = 0
    let unrealizedPnl = 0
    let totalCost = 0

    for (const pos of positions) {
      const qty = Number(pos.quantity)
      const avg = Number(pos.avgCost)
      totalCost += qty * avg

      // Fetch live price from market-data service
      try {
        const res = await fetch(`${process.env.MARKET_DATA_API_BASE || 'http://localhost:8000'}/api/quote?symbol=${pos.stockCode}`)
        const data = await res.json()
        const lastPrice = data?.price || avg
        positionsValue += qty * lastPrice
        unrealizedPnl += qty * (lastPrice - avg)
      } catch {
        positionsValue += qty * avg // fallback to cost
      }
    }

    const cash = Number(wallet.cash)
    const totalAssets = cash + positionsValue
    const realizedPnl = cash + totalCost - Number(wallet.initialBalance)
    // Note: realizedPnl = current cash + cost of remaining positions - initial
    // Simplified: realized from closed positions only. For V1, compute from orders.

    return {
      ...wallet,
      cash,
      positionsValue,
      totalAssets,
      totalPnl: unrealizedPnl + (cash + totalCost - Number(wallet.initialBalance)),
      positionCount: positions.length,
    }
  }))

  return c.json({ data: results })
})

// GET /api/paper/wallets/:id — wallet detail
app.get('/wallets/:id', async (c) => {
  const user = c.get('user') as any
  const id = Number(c.req.param('id'))

  const wallet = await db.select().from(paperWallets)
    .where(sql`${paperWallets.id} = ${id} AND ${paperWallets.userId} = ${user.id}`)
    .limit(1)

  if (!wallet.length) return c.json({ error: 'Wallet not found' }, 404)

  const positions = await db.select().from(paperPositions)
    .where(eq(paperPositions.walletId, id))

  let positionsValue = 0
  for (const pos of positions) {
    try {
      const res = await fetch(`${process.env.MARKET_DATA_API_BASE || 'http://localhost:8000'}/api/quote?symbol=${pos.stockCode}`)
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

  // Get live price from market-data
  let fillPrice = 0
  let stockName = ''
  try {
    const res = await fetch(`${process.env.MARKET_DATA_API_BASE || 'http://localhost:8000'}/api/quote?symbol=${body.stock_code}`)
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

    // Deduct cash
    await db.update(paperWallets)
      .set({ cash: String(cash - amount), updatedAt: new Date() })
      .where(eq(paperWallets.id, walletId))
  } else {
    // Sell — verify position exists and has enough quantity
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

    // Add cash
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

  // Get updated wallet and position
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

// GET /api/paper/wallets/:id/orders — order history
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

// GET /api/paper/wallets/:id/positions — positions with live P&L
app.get('/wallets/:id/positions', async (c) => {
  const user = c.get('user') as any
  const walletId = Number(c.req.param('id'))

  const positions = await db.select().from(paperPositions)
    .where(eq(paperPositions.walletId, walletId))

  const positionsWithPnl = await Promise.all(positions.map(async (pos) => {
    let lastPrice = Number(pos.avgCost)
    try {
      const res = await fetch(`${process.env.MARKET_DATA_API_BASE || 'http://localhost:8000'}/api/quote?symbol=${pos.stockCode}`)
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

  // Get stock name from market-data
  let stockName = ''
  try {
    const res = await fetch(`${process.env.MARKET_DATA_API_BASE || 'http://localhost:8000'}/api/quote?symbol=${body.stock_code}`)
    const data = await res.json()
    stockName = data?.name || ''
  } catch { /* ignore */ }

  const [existing] = await db.select().from(paperPositions)
    .where(sql`${paperPositions.walletId} = ${walletId} AND ${paperPositions.stockCode} = ${body.stock_code}`)
    .limit(1)

  if (existing) {
    const [updated] = await db.update(paperPositions)
      .set({ quantity: String(body.quantity), avgCost: String(body.avg_cost), stockName: stockName || existing.stockName, updatedAt: new Date() })
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
```

- [ ] **Step 2: Mount paper routes in app entry point**

Add to `api/business/src/index.ts`:

After the existing imports:
```typescript
import { paper as paperRoutes } from './routes/paper'
```

After the existing `app.route` lines:
```typescript
app.route('/api/paper', paperRoutes)
```

- [ ] **Step 3: Commit**

```bash
cd /Users/xuan/Documents/Trading-agent
git add api/business/src/routes/paper.ts api/business/src/index.ts
git commit -m "feat: add paper trading API routes (wallets, orders, positions)"
```

---

### Task 3: Frontend Composable

**Files:**
- Create: `web/admin/app/composables/usePaper.ts`

- [ ] **Step 1: Create the paper trading composable**

```typescript
// web/admin/app/composables/usePaper.ts
export interface PaperWallet {
  id: number
  userId: number
  name: string
  market: string
  currency: string
  initialBalance: string
  cash: number
  positionsValue?: number
  totalAssets?: number
  totalPnl?: number
  positionCount?: number
  createdAt: string
  updatedAt: string
}

export interface PaperPosition {
  id: number
  walletId: number
  stockCode: string
  stockName: string | null
  market: string
  quantity: number
  avgCost: number
  lastPrice: number
  marketValue: number
  unrealizedPnl: number
  unrealizedPnlPercent: number
  createdAt: string
  updatedAt: string
}

export interface PaperOrder {
  id: number
  walletId: number
  stockCode: string
  stockName: string | null
  side: 'buy' | 'sell'
  quantity: string
  price: string
  amount: string
  fee: string
  status: string
  filledAt: string
  createdAt: string
}

export function usePaper() {
  const { $api } = useNuxtApp()

  async function getWallets(): Promise<PaperWallet[]> {
    const res = await $api<{ data: PaperWallet[] }>('/api/paper/wallets')
    return res?.data || []
  }

  async function createWallet(data: { name: string; market: string; initial_balance: number }): Promise<PaperWallet> {
    const res = await $api<{ data: PaperWallet }>('/api/paper/wallets', {
      method: 'POST',
      body: JSON.stringify(data),
    })
    return res?.data!
  }

  async function deleteWallet(id: number): Promise<void> {
    await $api(`/api/paper/wallets/${id}`, { method: 'DELETE' })
  }

  async function resetWallet(id: number): Promise<void> {
    await $api(`/api/paper/wallets/${id}/reset`, { method: 'POST' })
  }

  async function getPositions(walletId: number): Promise<PaperPosition[]> {
    const res = await $api<{ data: PaperPosition[] }>(`/api/paper/wallets/${walletId}/positions`)
    return res?.data || []
  }

  async function addPosition(walletId: number, data: { stock_code: string; quantity: number; avg_cost: number }): Promise<PaperPosition> {
    const res = await $api<{ data: PaperPosition }>(`/api/paper/wallets/${walletId}/positions`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
    return res?.data!
  }

  async function placeOrder(walletId: number, data: { stock_code: string; side: 'buy' | 'sell'; quantity: number }): Promise<{
    order: PaperOrder
    position: PaperPosition | null
    wallet: PaperWallet
  }> {
    const res = await $api<{ data: any }>(`/api/paper/wallets/${walletId}/orders`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
    return res?.data!
  }

  async function getOrders(walletId: number, limit?: number): Promise<PaperOrder[]> {
    const res = await $api<{ data: PaperOrder[] }>(`/api/paper/wallets/${walletId}/orders?limit=${limit || 50}`)
    return res?.data || []
  }

  return {
    getWallets,
    createWallet,
    deleteWallet,
    resetWallet,
    getPositions,
    addPosition,
    placeOrder,
    getOrders,
  }
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/xuan/Documents/Trading-agent
git add web/admin/app/composables/usePaper.ts
git commit -m "feat: add paper trading composable"
```

---

### Task 4: Paper Trading Frontend Pages

**Files:**
- Create: `web/admin/app/pages/paper/index.vue`
- Create: `web/admin/app/pages/paper/[id].vue`

- [ ] **Step 1: Create wallet list page**

```vue
<!-- web/admin/app/pages/paper/index.vue -->
<script setup lang="ts">
import { toast } from 'vue-sonner'

definePageMeta({ middleware: 'auth' })

const paper = usePaper()
const wallets = ref<any[]>([])
const loading = ref(false)
const showCreate = ref(false)
const newWallet = reactive({ name: '', market: 'CN', initial_balance: 100000 })

async function loadWallets() {
  loading.value = true
  try { wallets.value = await paper.getWallets() }
  catch (e: any) { toast.error(e.message || 'Failed to load wallets') }
  finally { loading.value = false }
}

async function handleCreate() {
  try {
    await paper.createWallet(newWallet)
    showCreate.value = false
    newWallet.name = ''
    toast.success('Wallet created')
    await loadWallets()
  } catch (e: any) { toast.error(e.message || 'Failed to create wallet') }
}

async function handleDelete(id: number) {
  try {
    await paper.deleteWallet(id)
    toast.success('Wallet deleted')
    await loadWallets()
  } catch (e: any) { toast.error(e.message || 'Failed to delete wallet') }
}

const marketLabel: Record<string, string> = { CN: 'A股', HK: '港股', US: '美股' }
const marketFlag: Record<string, string> = { CN: '🇨🇳', HK: '🇭🇰', US: '🇺🇸' }
const currencySymbol: Record<string, string> = { CNY: '¥', HKD: 'HK$', USD: '$' }

function fmtAmount(v: number | undefined): string {
  if (v === undefined || v === null) return '-'
  const abs = Math.abs(v)
  if (abs >= 1e8) return (v / 1e8).toFixed(2) + '亿'
  if (abs >= 1e4) return (v / 1e4).toFixed(2) + '万'
  return v.toFixed(2)
}

function pnlClass(v: number | undefined): string {
  if (!v) return 'text-muted-foreground'
  return v >= 0 ? 'text-green-600' : 'text-red-600'
}

onMounted(loadWallets)
</script>

<template>
  <main class="container mx-auto py-6 px-4 max-w-7xl">
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold">纸面交易</h1>
        <p class="text-muted-foreground">管理您的虚拟钱包和模拟持仓</p>
      </div>
      <Button @click="showCreate = true">
        <Icon name="i-lucide-plus" class="size-4 mr-2" />
        创建钱包
      </Button>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="flex justify-center py-12">
      <Icon name="i-lucide-loader-2" class="size-8 animate-spin text-muted-foreground" />
    </div>

    <!-- Wallet Cards -->
    <div v-else-if="wallets.length > 0" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <Card v-for="w in wallets" :key="w.id" class="hover:shadow-md transition-shadow">
        <NuxtLink :to="`/paper/${w.id}`">
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <span>{{ marketFlag[w.market] }}</span>
              <span>{{ w.name }}</span>
            </CardTitle>
            <CardDescription>{{ marketLabel[w.market] }} · {{ w.currency }}</CardDescription>
          </CardHeader>
          <CardContent>
            <div class="text-2xl font-bold">{{ currencySymbol[w.currency] }}{{ fmtAmount(w.totalAssets) }}</div>
            <div class="flex gap-4 mt-1 text-sm">
              <span :class="pnlClass(w.totalPnl)">
                {{ (w.totalPnl ?? 0) >= 0 ? '+' : '' }}{{ currencySymbol[w.currency] }}{{ fmtAmount(w.totalPnl) }}
              </span>
              <span class="text-muted-foreground">{{ w.positionCount || 0 }} 个持仓</span>
            </div>
          </CardContent>
        </NuxtLink>
        <CardFooter class="flex justify-end gap-2">
          <Button size="sm" variant="ghost" @click="handleDelete(w.id)">
            <Icon name="i-lucide-trash-2" class="size-4" />
          </Button>
        </CardFooter>
      </Card>
    </div>

    <!-- Empty -->
    <div v-else class="text-center py-12">
      <Icon name="i-lucide-wallet" class="size-12 text-muted-foreground mx-auto mb-4" />
      <p class="text-muted-foreground mb-4">还没有钱包，创建第一个开始模拟交易</p>
      <Button @click="showCreate = true">创建钱包</Button>
    </div>

    <!-- Create Dialog -->
    <Dialog v-model:open="showCreate">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>创建钱包</DialogTitle>
          <DialogDescription>设置虚拟资金池用于模拟交易</DialogDescription>
        </DialogHeader>
        <div class="space-y-4">
          <div>
            <Label>钱包名称</Label>
            <Input v-model="newWallet.name" placeholder="如：富途A股" />
          </div>
          <div>
            <Label>市场</Label>
            <Select v-model="newWallet.market">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CN">🇨🇳 A股 (CNY)</SelectItem>
                <SelectItem value="HK">🇭🇰 港股 (HKD)</SelectItem>
                <SelectItem value="US">🇺🇸 美股 (USD)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>初始资金</Label>
            <Input v-model.number="newWallet.initial_balance" type="number" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="showCreate = false">取消</Button>
          <Button @click="handleCreate">创建</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </main>
</template>
```

- [ ] **Step 2: Create wallet detail page**

```vue
<!-- web/admin/app/pages/paper/[id].vue -->
<script setup lang="ts">
import { toast } from 'vue-sonner'

definePageMeta({ middleware: 'auth' })

const route = useRoute()
const paper = usePaper()
const walletId = Number(route.params.id)

const wallet = ref<any>(null)
const positions = ref<any[]>([])
const orders = ref<any[]>([])
const loading = ref(false)
const showOrder = ref(false)
const showPosition = ref(false)
const orderForm = reactive({ stock_code: '', side: 'buy' as 'buy' | 'sell', quantity: 1 })
const positionForm = reactive({ stock_code: '', quantity: 0, avg_cost: 0 })
const showReset = ref(false)

const marketFlag: Record<string, string> = { CN: '🇨🇳', HK: '🇭🇰', US: '🇺🇸' }
const currencySymbol: Record<string, string> = { CNY: '¥', HKD: 'HK$', USD: '$' }

async function loadData() {
  loading.value = true
  try {
    const [walletRes, posRes, orderRes] = await Promise.all([
      $api<{ data: any }>(`/api/paper/wallets/${walletId}`),
      paper.getPositions(walletId),
      paper.getOrders(walletId),
    ])
    wallet.value = walletRes?.data
    positions.value = posRes
    orders.value = orderRes
  } catch (e: any) { toast.error(e.message || 'Failed to load') }
  finally { loading.value = false }
}

async function handleOrder() {
  try {
    await paper.placeOrder(walletId, orderForm)
    toast.success(orderForm.side === 'buy' ? '买入成功' : '卖出成功')
    showOrder.value = false
    orderForm.stock_code = ''
    orderForm.quantity = 1
    await loadData()
  } catch (e: any) { toast.error(e.message || 'Order failed') }
}

async function handleAddPosition() {
  try {
    await paper.addPosition(walletId, positionForm)
    toast.success('持仓已录入')
    showPosition.value = false
    positionForm.stock_code = ''
    await loadData()
  } catch (e: any) { toast.error(e.message || 'Failed to add position') }
}

async function handleReset() {
  try {
    await paper.resetWallet(walletId)
    toast.success('钱包已重置')
    showReset.value = false
    await loadData()
  } catch (e: any) { toast.error(e.message || 'Reset failed') }
}

function fmtNumber(v: number | undefined): string {
  if (v === undefined || v === null) return '-'
  return v.toFixed(2)
}

function pnlClass(v: number): string {
  if (!v) return ''
  return v >= 0 ? 'text-green-600' : 'text-red-600'
}

onMounted(loadData)
</script>

<template>
  <main class="container mx-auto py-6 px-4 max-w-7xl">
    <!-- Loading -->
    <div v-if="loading && !wallet" class="flex justify-center py-12">
      <Icon name="i-lucide-loader-2" class="size-8 animate-spin text-muted-foreground" />
    </div>

    <template v-else-if="wallet">
      <!-- Header -->
      <div class="flex items-center justify-between mb-6">
        <div>
          <div class="flex items-center gap-2">
            <NuxtLink to="/paper">
              <Button variant="ghost" size="icon">
                <Icon name="i-lucide-chevron-left" class="size-5" />
              </Button>
            </NuxtLink>
            <h1 class="text-2xl font-bold">{{ marketFlag[wallet.market] }} {{ wallet.name }}</h1>
            <Badge variant="outline">{{ wallet.currency }}</Badge>
          </div>
        </div>
        <div class="flex gap-2">
          <Button variant="outline" @click="showPosition = true">
            <Icon name="i-lucide-file-input" class="size-4 mr-2" />
            录入持仓
          </Button>
          <Button @click="showOrder = true">
            <Icon name="i-lucide-arrow-left-right" class="size-4 mr-2" />
            下单
          </Button>
          <Button variant="destructive" @click="showReset = true">重置</Button>
        </div>
      </div>

      <!-- Account Summary -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader class="pb-2"><CardDescription>可用资金</CardDescription></CardHeader>
          <CardContent><div class="text-xl font-bold">{{ currencySymbol[wallet.currency] }}{{ fmtNumber(wallet.cash) }}</div></CardContent>
        </Card>
        <Card>
          <CardHeader class="pb-2"><CardDescription>持仓市值</CardDescription></CardHeader>
          <CardContent><div class="text-xl font-bold">{{ currencySymbol[wallet.currency] }}{{ fmtNumber(wallet.positionsValue) }}</div></CardContent>
        </Card>
        <Card>
          <CardHeader class="pb-2"><CardDescription>总资产</CardDescription></CardHeader>
          <CardContent><div class="text-xl font-bold">{{ currencySymbol[wallet.currency] }}{{ fmtNumber(wallet.totalAssets) }}</div></CardContent>
        </Card>
        <Card>
          <CardHeader class="pb-2"><CardDescription>初始资金</CardDescription></CardHeader>
          <CardContent><div class="text-xl font-bold">{{ currencySymbol[wallet.currency] }}{{ fmtNumber(wallet.initialBalance) }}</div></CardContent>
        </Card>
      </div>

      <!-- Positions -->
      <Card class="mb-6">
        <CardHeader>
          <CardTitle>持仓 ({{ positions.length }})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table v-if="positions.length > 0">
            <TableHeader>
              <TableRow>
                <TableHead>代码</TableHead>
                <TableHead>名称</TableHead>
                <TableHead class="text-right">数量</TableHead>
                <TableHead class="text-right">均价</TableHead>
                <TableHead class="text-right">最新价</TableHead>
                <TableHead class="text-right">市值</TableHead>
                <TableHead class="text-right">浮盈</TableHead>
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="pos in positions" :key="pos.id">
                <TableCell>
                  <NuxtLink :to="`/stock/${pos.stockCode}`" class="font-mono text-primary hover:underline">
                    {{ pos.stockCode }}
                  </NuxtLink>
                </TableCell>
                <TableCell>{{ pos.stockName || '-' }}</TableCell>
                <TableCell class="text-right">{{ pos.quantity }}</TableCell>
                <TableCell class="text-right">{{ currencySymbol[wallet.currency] }}{{ fmtNumber(pos.avgCost) }}</TableCell>
                <TableCell class="text-right">{{ currencySymbol[wallet.currency] }}{{ fmtNumber(pos.lastPrice) }}</TableCell>
                <TableCell class="text-right">{{ currencySymbol[wallet.currency] }}{{ fmtNumber(pos.marketValue) }}</TableCell>
                <TableCell class="text-right" :class="pnlClass(pos.unrealizedPnl)">
                  {{ currencySymbol[wallet.currency] }}{{ fmtNumber(pos.unrealizedPnl) }}
                  <span class="text-xs">({{ fmtNumber(pos.unrealizedPnlPercent) }}%)</span>
                </TableCell>
                <TableCell>
                  <div class="flex gap-1">
                    <NuxtLink :to="`/research?ticker=${pos.stockCode}`">
                      <Button size="icon" variant="ghost">
                        <Icon name="i-lucide-brain" class="size-4" />
                      </Button>
                    </NuxtLink>
                    <Button size="icon" variant="ghost" @click="orderForm.stock_code = pos.stockCode; orderForm.side = 'sell'; showOrder = true">
                      <Icon name="i-lucide-arrow-down-to-line" class="size-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
          <div v-else class="text-center py-8 text-muted-foreground text-sm">
            暂无持仓，下单或手动录入添加
          </div>
        </CardContent>
      </Card>

      <!-- Orders -->
      <Card>
        <CardHeader><CardTitle>订单记录 ({{ orders.length }})</CardTitle></CardHeader>
        <CardContent>
          <Table v-if="orders.length > 0">
            <TableHeader>
              <TableRow>
                <TableHead>时间</TableHead>
                <TableHead>方向</TableHead>
                <TableHead>代码</TableHead>
                <TableHead class="text-right">价格</TableHead>
                <TableHead class="text-right">数量</TableHead>
                <TableHead class="text-right">金额</TableHead>
                <TableHead>状态</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="o in orders" :key="o.id">
                <TableCell class="text-sm">{{ new Date(o.filledAt || o.createdAt).toLocaleString('zh-CN') }}</TableCell>
                <TableCell>
                  <Badge :variant="o.side === 'buy' ? 'default' : 'destructive'">
                    {{ o.side === 'buy' ? '买入' : '卖出' }}
                  </Badge>
                </TableCell>
                <TableCell class="font-mono">{{ o.stockCode }}</TableCell>
                <TableCell class="text-right">{{ currencySymbol[wallet.currency] }}{{ Number(o.price).toFixed(2) }}</TableCell>
                <TableCell class="text-right">{{ o.quantity }}</TableCell>
                <TableCell class="text-right">{{ currencySymbol[wallet.currency] }}{{ Number(o.amount).toFixed(2) }}</TableCell>
                <TableCell>
                  <Badge variant="outline">{{ o.status === 'filled' ? '已成交' : o.status }}</Badge>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
          <div v-else class="text-center py-8 text-muted-foreground text-sm">暂无订单记录</div>
        </CardContent>
      </Card>

      <!-- Order Dialog -->
      <Dialog v-model:open="showOrder">
        <DialogContent>
          <DialogHeader>
            <DialogTitle>下单</DialogTitle>
            <DialogDescription>市价单，按当前行情成交</DialogDescription>
          </DialogHeader>
          <div class="space-y-4">
            <div>
              <Label>方向</Label>
              <div class="flex gap-2 mt-1">
                <Button :variant="orderForm.side === 'buy' ? 'default' : 'outline'" @click="orderForm.side = 'buy'">买入</Button>
                <Button :variant="orderForm.side === 'sell' ? 'destructive' : 'outline'" @click="orderForm.side = 'sell'">卖出</Button>
              </div>
            </div>
            <div>
              <Label>股票代码</Label>
              <Input v-model="orderForm.stock_code" placeholder="A股: 000001 | 港股: 0700 | 美股: AAPL" />
            </div>
            <div>
              <Label>数量</Label>
              <Input v-model.number="orderForm.quantity" type="number" min="1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" @click="showOrder = false">取消</Button>
            <Button @click="handleOrder" :variant="orderForm.side === 'sell' ? 'destructive' : 'default'">
              {{ orderForm.side === 'buy' ? '买入' : '卖出' }}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <!-- Add Position Dialog -->
      <Dialog v-model:open="showPosition">
        <DialogContent>
          <DialogHeader>
            <DialogTitle>录入持仓</DialogTitle>
            <DialogDescription>手动添加已有持仓，不消耗现金</DialogDescription>
          </DialogHeader>
          <div class="space-y-4">
            <div>
              <Label>股票代码</Label>
              <Input v-model="positionForm.stock_code" placeholder="如：000001" />
            </div>
            <div>
              <Label>数量</Label>
              <Input v-model.number="positionForm.quantity" type="number" min="1" />
            </div>
            <div>
              <Label>成本价</Label>
              <Input v-model.number="positionForm.avg_cost" type="number" step="0.01" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" @click="showPosition = false">取消</Button>
            <Button @click="handleAddPosition">确认录入</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <!-- Reset Confirm Dialog -->
      <Dialog v-model:open="showReset">
        <DialogContent>
          <DialogHeader>
            <DialogTitle>重置钱包</DialogTitle>
            <DialogDescription>将清空所有持仓和订单，现金恢复为 {{ currencySymbol[wallet.currency] }}{{ fmtNumber(wallet.initialBalance) }}。此操作不可撤销。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" @click="showReset = false">取消</Button>
            <Button variant="destructive" @click="handleReset">确认重置</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </template>
  </main>
</template>
```

- [ ] **Step 3: Commit**

```bash
cd /Users/xuan/Documents/Trading-agent
git add web/admin/app/pages/paper/
git commit -m "feat: add paper trading frontend pages (wallet list, detail)"
```

---

### Task 5: Sidebar Menu & Dashboard Integration

**Files:**
- Modify: `web/admin/app/constants/menus.ts`
- Modify: `web/admin/app/pages/index.vue`

- [ ] **Step 1: Add Paper Trading to sidebar menu**

In `web/admin/app/constants/menus.ts`, add to the "Trading" section items:

```typescript
// After the Watchlist item, before Market:
{
  title: 'Paper Trading',
  icon: 'i-lucide-wallet',
  link: '/paper',
},
```

- [ ] **Step 2: Add Dashboard asset overview card**

In `web/admin/app/pages/index.vue`, add after the existing stats cards:

In the `<script setup>` section, add:
```typescript
const paper = usePaper()
const paperWallets = ref<any[]>([])
const totalPaperAssets = ref(0)

onMounted(async () => {
  try {
    paperWallets.value = await paper.getWallets()
    totalPaperAssets.value = paperWallets.value.reduce((sum: number, w: any) => sum + (w.totalAssets || 0), 0)
  } catch { /* ignore */ }
})
```

In the stats cards grid, add a new card:
```html
<NuxtLink to="/paper">
  <Card class="cursor-pointer hover:shadow-md transition-shadow">
    <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle class="text-sm font-medium">Paper Assets</CardTitle>
      <Icon name="i-lucide-wallet" class="size-4 text-muted-foreground" />
    </CardHeader>
    <CardContent>
      <div class="text-2xl font-bold">{{ paperWallets.length }} wallets</div>
      <p class="text-xs text-muted-foreground">{{ paperWallets.length > 0 ? 'Total virtual assets' : 'Create your first wallet' }}</p>
    </CardContent>
  </Card>
</NuxtLink>
```

Replace the existing disabled "Market Data" button with this active link:
```html
<NuxtLink to="/paper">
  <Button variant="outline" class="h-auto flex-col gap-2 py-4 w-full">
    <Icon name="i-lucide-wallet" class="size-6" />
    <span>Paper Trading</span>
  </Button>
</NuxtLink>
```

- [ ] **Step 3: Commit**

```bash
cd /Users/xuan/Documents/Trading-agent
git add web/admin/app/constants/menus.ts web/admin/app/pages/index.vue
git commit -m "feat: add paper trading to sidebar and dashboard"
```

---

### Task 6: Verify & Test

- [ ] **Step 1: Verify backend compiles**

```bash
cd /Users/xuan/Documents/Trading-agent && pnpm --filter api type-check
```

- [ ] **Step 2: Verify frontend compiles**

```bash
cd /Users/xuan/Documents/Trading-agent && pnpm --filter web type-check
```

- [ ] **Step 3: Push DB schema**

```bash
cd /Users/xuan/Documents/Trading-agent && pnpm db:push
```

- [ ] **Step 4: Manual smoke test**

Start the services:
```bash
docker compose up -d
# or: pnpm dev:all
```

Test the key flows:
1. Create a wallet via the UI → verify wallet card appears
2. Place a buy order → verify position created, cash deducted
3. Place a sell order → verify position updated, cash increased
4. Add a manual position → verify position appears, cash unchanged
5. Check order history → verify all orders recorded
6. Reset wallet → verify positions/orders cleared, cash restored

- [ ] **Step 5: Commit any fixes**

```bash
cd /Users/xuan/Documents/Trading-agent
git add -A
git commit -m "chore: verify paper trading feature"
```
