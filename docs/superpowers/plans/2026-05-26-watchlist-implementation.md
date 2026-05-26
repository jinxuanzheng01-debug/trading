# 自选股功能实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标**: 构建一个支持多市场（A股/港股/美股）的自选股系统，提供 T+1 行情展示、排序筛选功能，数据本地缓存支持后续回测。

**架构**: 分层混合架构 - 前端调用 api/business 聚合接口，优先查询本地 stock_quotes 缓存，缺失时调用 market-data 服务补充。定时任务（scheduler 服务）分市场更新数据。

**技术栈**: 
- 后端: Hono + Drizzle ORM + PostgreSQL (api/business)
- 数据服务: FastAPI + Python (market-data, scheduler)
- 前端: Nuxt 4 + Vue 3 + shadcn-vue + TailwindCSS (web/admin)

---

## 文件结构规划

### 新建文件

**数据库层 (api/business)**
- `src/db/schema-stock.ts` - 股票行情表定义（stock_quotes, stock_quote_history）
- `src/db/migrations/20260526_stock_quotes.sql` - 数据库迁移文件

**API 层 (api/business)**
- `src/routes/watchlist-quotes.ts` - 行情查询接口（新增）
- `src/lib/market-data-client.ts` - market-data 服务客户端（新增）

**前端层 (web/admin)**
- `app/components/watchlist/WatchlistToolbar.vue` - 工具栏组件
- `app/components/watchlist/WatchlistTable.vue` - 数据表格组件
- `app/components/watchlist/StockDetailDialog.vue` - 标的详情弹窗
- `app/composables/useStockQuotes.ts` - 行情数据 composable
- `app/assets/css/custom.css` - 涨跌色彩 CSS 变量

**定时任务 (scheduler)**
- `app/jobs/sync_stock_quotes.py` - 股票行情同步任务

### 修改文件

**数据库层**
- `src/db/schema.ts` - 添加 sort_order, market 字段到 watchlist_items
- `src/db/index.ts` - 导出新的表定义

**API 层**
- `src/routes/watchlist.ts` - 增强现有接口（排序、刷新）
- `src/index.ts` - 注册新路由

**前端层**
- `app/pages/watchlist/index.vue` - 重构为新的组件结构
- `app/composables/useWatchlist.ts` - 添加行情相关方法

**数据服务 (market-data)**
- `app/api/quotes.py` - 批量行情接口（如不存在则创建）
- `app/api/kline.py` - 多周期 K 线接口（增强）

**样式**
- `app/assets/css/tailwind.css` - 添加涨跌色彩变量

---

## Task 1: 数据库 Schema 扩展

**Files:**
- Modify: `api/business/src/db/schema.ts`
- Create: `api/business/src/db/schema-stock.ts`
- Create: `api/business/src/db/migrations/20260526_stock_quotes.sql`

**Subtasks:**

- [ ] **Step 1: 添加字段到 watchlist_items**

编辑 `api/business/src/db/schema.ts`，在 `watchlistItems` 表定义中添加新字段：

```typescript
export const watchlistItems = pgTable('watchlist_items', {
  id: serial('id').primaryKey(),
  groupId: serial('group_id').notNull().references(() => watchlistGroups.id, { onDelete: 'cascade' }),
  symbol: varchar('symbol', { length: 50 }).notNull(),
  name: varchar('name', { length: 100 }),
  type: varchar('type', { length: 20 }).default('stock'),
  exchange: varchar('exchange', { length: 50 }),
  notes: text('notes'),
  sort_order: integer('sort_order').default(0),      // 新增
  market: varchar('market', { length: 20 }),          // 新增: CN/US/HK
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})
```

注意：需要先从 drizzle-orm 导入 `integer` 类型。

- [ ] **Step 2: 创建股票行情表定义**

创建 `api/business/src/db/schema-stock.ts`：

```typescript
import { pgTable, serial, varchar, text, integer, decimal, timestamp, boolean, index, unique } from 'drizzle-orm/pg-core'

export const stockQuotes = pgTable('stock_quotes', {
  symbol: varchar('symbol', { length: 50 }).primaryKey(),
  market: varchar('market', { length: 20 }).notNull(),
  name: varchar('name', { length: 100 }),
  type: varchar('type', { length: 20 }),
  exchange: varchar('exchange', { length: 50 }),
  interval: varchar('interval', { length: 10 }).notNull(), // 1d/1w/1m
  open: decimal('open', { precision: 12, scale: 4 }),
  high: decimal('high', { precision: 12, scale: 4 }),
  low: decimal('low', { precision: 12, scale: 4 }),
  close: decimal('close', { precision: 12, scale: 4 }),
  volume: integer('volume'),
  amount: integer('amount'),
  change: decimal('change', { precision: 12, scale: 4 }),
  change_percent: decimal('change_percent', { precision: 8, scale: 4 }),
  turnover_rate: decimal('turnover_rate', { precision: 8, scale: 4 }),
  prev_close: decimal('prev_close', { precision: 12, scale: 4 }),
  timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),
  data_date: timestamp('data_date').notNull(),
  updated_at: timestamp('updated_at').defaultNow(),
}, (table) => ({
  marketIdx: index('stock_quotes_market_idx').on(table.market),
  intervalIdx: index('stock_quotes_interval_idx').on(table.interval),
  symbolIntervalUnique: unique('symbol_interval_unique').on(table.symbol, table.interval),
}))

export const stockQuoteHistory = pgTable('stock_quote_history', {
  id: serial('id').primaryKey(),
  symbol: varchar('symbol', { length: 50 }).notNull(),
  market: varchar('market', { length: 20 }).notNull(),
  interval: varchar('interval', { length: 10 }).notNull(),
  open: decimal('open', { precision: 12, scale: 4 }),
  high: decimal('high', { precision: 12, scale: 4 }),
  low: decimal('low', { precision: 12, scale: 4 }),
  close: decimal('close', { precision: 12, scale: 4 }),
  volume: integer('volume'),
  amount: integer('amount'),
  change: decimal('change', { precision: 12, scale: 4 }),
  change_percent: decimal('change_percent', { precision: 8, scale: 4 }),
  timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),
  created_at: timestamp('created_at').defaultNow(),
}, (table) => ({
  symbolIntervalTimeUnique: unique('symbol_interval_time_unique').on(table.symbol, table.interval, table.timestamp),
  symbolIdx: index('stock_quote_history_symbol_idx').on(table.symbol),
  intervalIdx: index('stock_quote_history_interval_idx').on(table.interval),
  timestampIdx: index('stock_quote_history_timestamp_idx').on(table.timestamp),
}))
```

- [ ] **Step 3: 创建数据库迁移文件**

创建 `api/business/src/db/migrations/20260526_stock_quotes.sql`：

```sql
-- 添加字段到 watchlist_items
ALTER TABLE watchlist_items ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
ALTER TABLE watchlist_items ADD COLUMN IF NOT EXISTS market VARCHAR(20);

-- 创建股票行情表
CREATE TABLE IF NOT EXISTS stock_quotes (
  symbol VARCHAR(50) PRIMARY KEY,
  market VARCHAR(20) NOT NULL,
  name VARCHAR(100),
  type VARCHAR(20),
  exchange VARCHAR(50),
  interval VARCHAR(10) NOT NULL,
  open DECIMAL(12, 4),
  high DECIMAL(12, 4),
  low DECIMAL(12, 4),
  close DECIMAL(12, 4),
  volume BIGINT,
  amount BIGINT,
  change DECIMAL(12, 4),
  change_percent DECIMAL(8, 4),
  turnover_rate DECIMAL(8, 4),
  prev_close DECIMAL(12, 4),
  timestamp TIMESTAMPTZ NOT NULL,
  data_date DATE NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS stock_quotes_market_idx ON stock_quotes(market);
CREATE INDEX IF NOT EXISTS stock_quotes_interval_idx ON stock_quotes(interval);
CREATE UNIQUE INDEX IF NOT EXISTS symbol_interval_unique ON stock_quotes(symbol, interval);

-- 创建历史数据表
CREATE TABLE IF NOT EXISTS stock_quote_history (
  id SERIAL PRIMARY KEY,
  symbol VARCHAR(50) NOT NULL,
  market VARCHAR(20) NOT NULL,
  interval VARCHAR(10) NOT NULL,
  open DECIMAL(12, 4),
  high DECIMAL(12, 4),
  low DECIMAL(12, 4),
  close DECIMAL(12, 4),
  volume BIGINT,
  amount BIGINT,
  change DECIMAL(12, 4),
  change_percent DECIMAL(8, 4),
  timestamp TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(symbol, interval, timestamp)
);

CREATE INDEX IF NOT EXISTS stock_quote_history_symbol_idx ON stock_quote_history(symbol);
CREATE INDEX IF NOT EXISTS stock_quote_history_interval_idx ON stock_quote_history(interval);
CREATE INDEX IF NOT EXISTS stock_quote_history_timestamp_idx ON stock_quote_history(timestamp);
```

- [ ] **Step 4: 应用迁移**

```bash
cd api/business
pnpm db:push
```

预期输出：迁移成功，新表已创建。

- [ ] **Step 5: 更新类型导出**

编辑 `api/business/src/db/schema.ts`，在文件末尾添加：

```typescript
export type StockQuote = typeof stockQuotes.$inferSelect
export type NewStockQuote = typeof stockQuotes.$inferInsert
export type StockQuoteHistory = typeof stockQuoteHistory.$inferSelect
export type NewStockQuoteHistory = typeof stockQuoteHistory.$inferInsert
```

- [ ] **Step 6: 更新 db/index.ts**

编辑 `api/business/src/db/index.ts`，添加新表的导入：

```typescript
export * from './schema'
export * from './schema-stock'
```

- [ ] **Step 7: 提交**

```bash
git add api/business/src/db/
git commit -m "feat: add stock quotes tables and migrations"
```

---

## Task 2: Market-Data 服务客户端

**Files:**
- Create: `api/business/src/lib/market-data-client.ts`

- [ ] **Step 1: 创建 market-data 客户端**

创建 `api/business/src/lib/market-data-client.ts`：

```typescript
interface MarketDataQuote {
  symbol: string
  name: string
  type: string
  exchange: string
  price: number
  change: number
  changePercent: number
  volume: number
  marketCap: number
  prevClose: number
  dataDate: string
}

interface KlineData {
  symbol: string
  interval: string
  open: number
  high: number
  low: number
  close: number
  volume: number
  timestamp: string
  dataDate: string
}

const MARKET_DATA_BASE = process.env.MARKET_DATA_API_BASE || 'http://localhost:8000'

export async function getQuotes(symbols: string[]): Promise<MarketDataQuote[]> {
  const response = await fetch(`${MARKET_DATA_BASE}/api/quotes?symbols=${symbols.join(',')}`)
  if (!response.ok) {
    throw new Error(`Market-data service error: ${response.statusText}`)
  }
  const data = await response.json()
  return data.quotes || []
}

export async function getKlines(
  symbol: string,
  interval: string,
  limit?: number
): Promise<KlineData[]> {
  const params = new URLSearchParams({
    symbol,
    interval,
    ...(limit && { limit: limit.toString() })
  })
  
  const response = await fetch(`${MARKET_DATA_BASE}/api/kline?${params}`)
  if (!response.ok) {
    throw new Error(`Market-data service error: ${response.statusText}`)
  }
  const data = await response.json()
  return data.data || []
}
```

- [ ] **Step 2: 提交**

```bash
git add api/business/src/lib/market-data-client.ts
git commit -m "feat: add market-data service client"
```

---

## Task 3: 行情查询 API 接口

**Files:**
- Create: `api/business/src/routes/watchlist-quotes.ts`
- Modify: `api/business/src/index.ts`

- [ ] **Step 1: 创建行情查询路由**

创建 `api/business/src/routes/watchlist-quotes.ts`：

```typescript
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db'
import { watchlistGroups, watchlistItems, stockQuotes } from '../db'
import { authMiddleware } from '../middleware/auth'
import { eq, and, inArray, sql } from 'drizzle-orm'
import '../types/hono'
import { getQuotes, getKlines } from '../lib/market-data-client'

const quotes = new Hono()
quotes.use('*', authMiddleware)

const intervalSchema = z.enum(['1d', '1w', '1m'])

// GET /api/watchlist/groups/:groupId/quotes
quotes.get('/groups/:groupId/quotes', async (c) => {
  const user = c.get('user')
  const groupId = Number(c.req.param('groupId'))
  const interval = c.req.query('interval') || '1d'

  // 验证 interval 参数
  const validatedInterval = intervalSchema.safeParse(interval)
  if (!validatedInterval.success) {
    return c.json({ error: 'Invalid interval parameter' }, 400)
  }

  // 验证分组所有权
  const [group] = await db.select().from(watchlistGroups)
    .where(and(eq(watchlistGroups.id, groupId), eq(watchlistGroups.userId, user.userId)))
    .limit(1)

  if (!group) {
    return c.json({ error: 'Group not found' }, 404)
  }

  // 获取分组下的标的
  const items = await db.select({
    id: watchlistItems.id,
    symbol: watchlistItems.symbol,
    name: watchlistItems.name,
    type: watchlistItems.type,
    exchange: watchlistItems.exchange,
    market: watchlistItems.market,
    sort_order: watchlistItems.sortOrder,
  }).from(watchlistItems).where(eq(watchlistItems.groupId, groupId))

  const symbols = items.map(item => item.symbol)

  if (symbols.length === 0) {
    return c.json({
      group,
      quotes: [],
      summary: { total: 0, up: 0, down: 0, flat: 0 }
    })
  }

  // 查询本地缓存
  const cachedQuotes = await db.select().from(stockQuotes)
    .where(
      and(
        inArray(stockQuotes.symbol, symbols),
        eq(stockQuotes.interval, validatedInterval.data)
      )
    )

  // 检查缺失的标的
  const cachedSymbols = new Set(cachedQuotes.map(q => q.symbol))
  const missingSymbols = symbols.filter(s => !cachedSymbols.has(s))

  // 从 market-data 获取缺失的数据
  let fetchedQuotes: any[] = []
  if (missingSymbols.length > 0) {
    try {
      fetchedQuotes = await getQuotes(missingSymbols)
    } catch (error) {
      console.error('Failed to fetch market data:', error)
    }

    // 更新缓存
    if (fetchedQuotes.length > 0) {
      for (const quote of fetchedQuotes) {
        await db.insert(stockQuotes)
          .values({
            symbol: quote.symbol,
            market: quote.market || 'US',
            name: quote.name,
            type: quote.type,
            exchange: quote.exchange,
            interval: validatedInterval.data,
            close: quote.price,
            change: quote.change,
            change_percent: quote.changePercent,
            volume: quote.volume,
            market_cap: quote.marketCap,
            prev_close: quote.prevClose,
            timestamp: new Date(quote.dataDate),
            data_date: new Date(quote.dataDate),
          })
          .onConflictDoNothing()
      }
    }
  }

  // 合并数据
  const allQuotes = [...cachedQuotes, ...fetchedQuotes]
  
  // 关联标的元数据
  const quotes = items.map(item => {
    const quote = allQuotes.find(q => q.symbol === item.symbol)
    return {
      itemId: item.id,
      symbol: item.symbol,
      name: item.name || quote?.name || item.symbol,
      type: item.type,
      exchange: item.exchange || quote?.exchange,
      market: item.market,
      sort_order: item.sort_order,
      ...quote,
    }
  })

  // 计算汇总
  const summary = {
    total: quotes.length,
    up: quotes.filter(q => q.change_percent && q.change_percent > 0).length,
    down: quotes.filter(q => q.change_percent && q.change_percent < 0).length,
    flat: quotes.filter(q => !q.change_percent || q.change_percent === 0).length,
  }

  return c.json({
    group,
    quotes,
    summary,
  })
})

// POST /api/watchlist/groups/:groupId/refresh
quotes.post('/groups/:groupId/refresh', async (c) => {
  const user = c.get('user')
  const groupId = Number(c.req.param('groupId'))
  const interval = c.req.query('interval') || '1d'

  const validatedInterval = intervalSchema.safeParse(interval)
  if (!validatedInterval.success) {
    return c.json({ error: 'Invalid interval parameter' }, 400)
  }

  // 验证分组所有权
  const [group] = await db.select().from(watchlistGroups)
    .where(and(eq(watchlistGroups.id, groupId), eq(watchlistGroups.userId, user.userId)))
    .limit(1)

  if (!group) {
    return c.json({ error: 'Group not found' }, 404)
  }

  // 获取所有标的
  const items = await db.select().from(watchlistItems)
    .where(eq(watchlistItems.groupId, groupId))

  const symbols = items.map(item => item.symbol)

  if (symbols.length === 0) {
    return c.json({ success: true, updated: 0, failed: 0 })
  }

  let updated = 0
  let failed = 0

  try {
    const fetchedQuotes = await getQuotes(symbols)

    for (const quote of fetchedQuotes) {
      try {
        await db.insert(stockQuotes)
          .values({
            symbol: quote.symbol,
            market: quote.market || 'US',
            name: quote.name,
            type: quote.type,
            exchange: quote.exchange,
            interval: validatedInterval.data,
            close: quote.price,
            change: quote.change,
            change_percent: quote.changePercent,
            volume: quote.volume,
            market_cap: quote.marketCap,
            prev_close: quote.prevClose,
            timestamp: new Date(quote.dataDate),
            data_date: new Date(quote.dataDate),
          })
          .onConflictDoNothing()
        updated++
      } catch (error) {
        console.error(`Failed to update quote for ${quote.symbol}:`, error)
        failed++
      }
    }
  } catch (error) {
    console.error('Failed to refresh quotes:', error)
    return c.json({ error: 'Failed to refresh quotes' }, 500)
  }

  return c.json({ success: true, updated, failed })
})

// PUT /api/watchlist/groups/:groupId/reorder
quotes.put('/groups/:groupId/reorder', zValidator('json', z.object({
  itemIds: z.array(z.number())
})), async (c) => {
  const user = c.get('user')
  const groupId = Number(c.req.param('groupId'))
  const { itemIds } = c.req.valid('json')

  // 验证分组所有权
  const [group] = await db.select().from(watchlistGroups)
    .where(and(eq(watchlistGroups.id, groupId), eq(watchlistGroups.userId, user.userId)))
    .limit(1)

  if (!group) {
    return c.json({ error: 'Group not found' }, 404)
  }

  // 验证所有 items 都属于该分组
  const existingItems = await db.select({ id: watchlistItems.id })
    .from(watchlistItems)
    .where(eq(watchlistItems.groupId, groupId))

  const existingIds = new Set(existingItems.map(i => i.id))
  for (const id of itemIds) {
    if (!existingIds.has(id)) {
      return c.json({ error: `Item ${id} not found in group` }, 400)
    }
  }

  // 更新 sort_order
  for (let i = 0; i < itemIds.length; i++) {
    await db.update(watchlistItems)
      .set({ sort_order: i })
      .where(eq(watchlistItems.id, itemIds[i]))
  }

  return c.json({ success: true })
})

// GET /api/watchlist/items/:itemId/kline
quotes.get('/items/:itemId/kline', async (c) => {
  const user = c.get('user')
  const itemId = Number(c.req.param('itemId'))
  const interval = c.req.query('interval') || '1d'
  const limit = c.req.query('limit') ? Number(c.req.query('limit')) : 100

  const validatedInterval = intervalSchema.safeParse(interval)
  if (!validatedInterval.success) {
    return c.json({ error: 'Invalid interval parameter' }, 400)
  }

  // 验证所有权
  const [item] = await db.select({
    item: watchlistItems,
    symbol: watchlistItems.symbol,
    market: watchlistItems.market,
  }).from(watchlistItems)
    .innerJoin(watchlistGroups, eq(watchlistItems.groupId, watchlistGroups.id))
    .where(and(eq(watchlistItems.id, itemId), eq(watchlistGroups.userId, user.userId)))
    .limit(1)

  if (!item) {
    return c.json({ error: 'Item not found' }, 404)
  }

  // 查询历史数据
  const history = await db.select().from(stockQuotes)
    .where(
      and(
        eq(stockQuotes.symbol, item.symbol),
        eq(stockQuotes.interval, validatedInterval.data)
      )
    )
    .orderBy(stockQuotes.timestamp)
    .limit(limit)

  return c.json({
    item: {
      id: item.item.id,
      symbol: item.item.symbol,
      name: item.item.name,
      type: item.item.type,
      exchange: item.item.exchange,
      market: item.market,
    },
    interval: validatedInterval.data,
    data: history,
  })
})

export { quotes }
```

- [ ] **Step 2: 注册新路由**

编辑 `api/business/src/index.ts`，添加：

```typescript
import { quotes } from './routes/watchlist-quotes'

app.route('/watchlist', quotes)
```

- [ ] **Step 3: 提交**

```bash
git add api/business/src/routes/watchlist-quotes.ts api/business/src/index.ts
git commit -m "feat: add watchlist quotes API endpoints"
```

---

## Task 4: 增强 Watchlist 功能

**Files:**
- Modify: `api/business/src/routes/watchlist.ts`

- [ ] **Step 1: 在添加标的时获取市场数据**

编辑 `api/business/src/routes/watchlist.ts`，修改 `POST /groups/:id/items` 处理：

```typescript
import { getQuotes } from '../lib/market-data-client'

// ... 在文件顶部添加导入

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

  // 尝试从 market-data 获取股票信息
  let enrichedData = { ...data }
  try {
    const quotes = await getQuotes([data.symbol])
    if (quotes.length > 0) {
      const quote = quotes[0]
      enrichedData = {
        ...data,
        name: data.name || quote.name,
        exchange: data.exchange || quote.exchange,
        type: data.type || quote.type,
      }
    }
  } catch (error) {
    console.error('Failed to fetch stock info:', error)
    // 继续使用用户提供的数据
  }

  const [item] = await db.insert(watchlistItems).values({
    groupId: id,
    ...enrichedData,
  }).returning()

  return c.json(item, 201)
})
```

- [ ] **Step 2: 提交**

```bash
git add api/business/src/routes/watchlist.ts
git commit -m "feat: enrich watchlist items with market-data on add"
```

---

## Task 5: 前端 Composable

**Files:**
- Create: `web/admin/app/composables/useStockQuotes.ts`

- [ ] **Step 1: 创建行情数据 composable**

创建 `web/admin/app/composables/useStockQuotes.ts`：

```typescript
export interface StockQuote {
  itemId: number
  symbol: string
  name: string
  type: string
  exchange: string
  market: string
  sort_order: number
  open: number
  high: number
  low: number
  close: number
  volume: number
  change: number
  changePercent: number
  timestamp: string
  dataDate: string
}

export interface QuotesResponse {
  group: {
    id: number
    name: string
    itemCount: number
  }
  quotes: StockQuote[]
  summary: {
    total: number
    up: number
    down: number
    flat: number
  }
}

export interface KlineResponse {
  item: {
    id: number
    symbol: string
    name: string
    type: string
    exchange: string
    market: string
  }
  interval: string
  data: {
    timestamp: string
    open: number
    high: number
    low: number
    close: number
    volume: number
  }[]
}

export function useStockQuotes() {
  const config = useRuntimeConfig()
  const { fetchWithAuth } = useAuth()

  async function getGroupQuotes(groupId: number, interval: string = '1d') {
    return await fetchWithAuth<QuotesResponse>(
      `${config.public.apiBase}/api/watchlist/groups/${groupId}/quotes?interval=${interval}`
    )
  }

  async function refreshGroup(groupId: number, interval: string = '1d') {
    return await fetchWithAuth<{ success: boolean; updated: number; failed: number }>(
      `${config.public.apiBase}/api/watchlist/groups/${groupId}/refresh?interval=${interval}`,
      {
        method: 'POST',
      }
    )
  }

  async function reorderItems(groupId: number, itemIds: number[]) {
    return await fetchWithAuth<{ success: boolean }>(
      `${config.public.apiBase}/api/watchlist/groups/${groupId}/reorder`,
      {
        method: 'PUT',
        body: JSON.stringify({ itemIds }),
      }
    )
  }

  async function getItemKline(itemId: number, interval: string = '1d', limit: number = 100) {
    return await fetchWithAuth<KlineResponse>(
      `${config.public.apiBase}/api/watchlist/items/${itemId}/kline?interval=${interval}&limit=${limit}`
    )
  }

  return {
    getGroupQuotes,
    refreshGroup,
    reorderItems,
    getItemKline,
  }
}
```

- [ ] **Step 2: 更新 useWatchlist**

编辑 `web/admin/app/composables/useWatchlist.ts`，确保类型定义匹配：

```typescript
export interface WatchlistItem {
  id: number
  groupId: number
  symbol: string
  name?: string
  type: 'stock' | 'etf' | 'index' | 'crypto'
  exchange?: string
  market?: string          // 新增
  sort_order?: number     // 新增
  notes?: string
  createdAt: string
  updatedAt: string
}
```

- [ ] **Step 3: 提交**

```bash
git add web/admin/app/composables/
git commit -m "feat: add stock quotes composable and types"
```

---

## Task 6: 前端 UI 组件 - WatchlistTable

**Files:**
- Create: `web/admin/app/components/watchlist/WatchlistTable.vue`

- [ ] **Step 1: 创建数据表格组件**

创建 `web/admin/app/components/watchlist/WatchlistTable.vue`：

```vue
<script setup lang="ts">
import type { StockQuote } from '~/composables/useStockQuotes'

const props = defineProps<{
  quotes: StockQuote[]
  loading?: boolean
}>()

const emit = defineEmits<{
  sort: [field: string]
}>()

const sortField = ref<string>()
const sortOrder = ref<'asc' | 'desc'>('desc')

function handleSort(field: string) {
  if (sortField.value === field) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortField.value = field
    sortOrder.value = 'desc'
  }
  emit('sort', field)
}

const sortedQuotes = computed(() => {
  if (!sortField.value) return props.quotes

  return [...props.quotes].sort((a, b) => {
    const aVal = a[sortField.value]
    const bVal = b[sortField.value]
    
    if (aVal === undefined) return 1
    if (bVal === undefined) return -1
    
    const result = aVal > bVal ? 1 : aVal < bVal ? -1 : 0
    return sortOrder.value === 'asc' ? result : -result
  })
})
</script>

<template>
  <div class="border rounded-md">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead class="w-[200px]">代码</TableHead>
          <TableHead 
            class="text-right cursor-pointer hover:bg-muted/50"
            @click="handleSort('name')"
          >
            名称
          </TableHead>
          <TableHead 
            class="text-right cursor-pointer hover:bg-muted/50"
            @click="handleSort('close')"
          >
            最新价
            <span v-if="sortField === 'close'" class="ml-1">
              {{ sortOrder === 'asc' ? '↑' : '↓' }}
            </span>
          </TableHead>
          <TableHead 
            class="text-right cursor-pointer hover:bg-muted/50"
            @click="handleSort('changePercent')"
          >
            涨跌幅
            <span v-if="sortField === 'changePercent'" class="ml-1">
              {{ sortOrder === 'asc' ? '↑' : '↓' }}
            </span>
          </TableHead>
          <TableHead class="text-right">成交量</TableHead>
          <TableHead class="w-[80px] text-right">操作</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow v-if="loading">
          <TableCell :colspan="6" class="text-center text-muted-foreground">
            加载中...
          </TableCell>
        </TableRow>
        <TableRow v-else-if="sortedQuotes.length === 0">
          <TableCell :colspan="6" class="text-center text-muted-foreground">
            暂无数据，点击刷新获取
          </TableCell>
        </TableRow>
        <TableRow 
          v-for="quote in sortedQuotes" 
          :key="quote.itemId"
          class="hover:bg-muted/50"
        >
          <TableCell class="font-medium">
            <div class="flex items-center gap-2">
              <span>{{ quote.symbol }}</span>
              <Badge variant="outline" class="text-xs">
                {{ quote.type }}
              </Badge>
              <Badge v-if="quote.market" variant="secondary" class="text-xs">
                {{ quote.market }}
              </Badge>
            </div>
          </TableCell>
          <TableCell class="text-right text-muted-foreground">
            {{ quote.name || '-' }}
          </TableCell>
          <TableCell 
            class="text-right tabular-nums"
            :class="quote.changePercent > 0 ? 'text-green-600' : quote.changePercent < 0 ? 'text-red-600' : ''"
          >
            {{ quote.close ? quote.close.toFixed(2) : '--' }}
          </TableCell>
          <TableCell 
            class="text-right tabular-nums"
            :class="quote.changePercent > 0 ? 'text-green-600' : quote.changePercent < 0 ? 'text-red-600' : ''"
          >
            {{ quote.changePercent ? `${quote.changePercent > 0 ? '+' : ''}${quote.changePercent.toFixed(2)}%` : '--' }}
          </TableCell>
          <TableCell class="text-right tabular-nums text-muted-foreground">
            {{ quote.volume ? formatNumber(quote.volume) : '--' }}
          </TableCell>
          <TableCell class="text-right">
            <DropdownMenu>
              <DropdownMenuTrigger>
                <Button variant="ghost" size="icon" class="h-8 w-8">
                  <Icon name="more-vertical" :size="16" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem>查看详情</DropdownMenuItem>
                <DropdownMenuItem>编辑</DropdownMenuItem>
                <DropdownMenuItem class="text-destructive">删除</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  </div>
</template>
```

- [ ] **Step 2: 提交**

```bash
git add web/admin/app/components/watchlist/WatchlistTable.vue
git commit -m "feat: add WatchlistTable component with sorting"
```

---

## Task 7: 前端 UI 组件 - WatchlistToolbar

**Files:**
- Create: `web/admin/app/components/watchlist/WatchlistToolbar.vue`

- [ ] **Step 1: 创建工具栏组件**

创建 `web/admin/app/components/watchlist/WatchlistToolbar.vue`：

```vue
<script setup lang="ts">
const props = defineProps<{
  currentInterval: string
}>()

const emit = defineEmits<{
  refresh: []
  setInterval: [interval: string]
  filter: [filters: any]
}>()

const intervals = [
  { value: '1d', label: '日线' },
  { value: '1w', label: '周线' },
  { value: '1m', label: '月线' },
]

const isRefreshing = ref(false)

async function handleRefresh() {
  isRefreshing.value = true
  try {
    emit('refresh')
  } finally {
    setTimeout(() => {
      isRefreshing.value = false
    }, 500)
  }
}
</script>

<template>
  <div class="flex items-center justify-between p-4 border-b bg-card">
    <div class="flex items-center gap-2">
      <!-- 周期切换 -->
      <div class="inline-flex items-center rounded-md border bg-background p-1">
        <button
          v-for="interval in intervals"
          :key="interval.value"
          @click="emit('setInterval', interval.value)"
          :class="[
            'px-3 py-1.5 text-sm font-medium rounded-sm transition-colors',
            currentInterval === interval.value
              ? 'bg-primary text-primary-foreground shadow'
              : 'hover:bg-muted'
          ]"
        >
          {{ interval.label }}
        </button>
      </div>

      <!-- 筛选按钮 -->
      <Button variant="outline" size="sm">
        <Icon name="filter" :size="16" class="mr-2" />
        筛选
      </Button>
    </div>

    <!-- 刷新按钮 -->
    <Button 
      variant="outline" 
      size="sm"
      :disabled="isRefreshing"
      @click="handleRefresh"
    >
      <Icon 
        name="refresh-cw" 
        :size="16" 
        :class="{ 'animate-spin': isRefreshing }"
        class="mr-2"
      />
      刷新
    </Button>
  </div>
</template>
```

- [ ] **Step 2: 提交**

```bash
git add web/admin/app/components/watchlist/WatchlistToolbar.vue
git commit -m "feat: add WatchlistToolbar component with interval switching"
```

---

## Task 8: 前端 UI 组件 - StockDetailDialog

**Files:**
- Create: `web/admin/app/components/watchlist/StockDetailDialog.vue`

- [ ] **Step 1: 创建详情弹窗组件**

创建 `web/admin/app/components/watchlist/StockDetailDialog.vue`：

```vue
<script setup lang="ts">
import { ref, watch } from 'vue'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useStockQuotes } from '~/composables/useStockQuotes'

const props = defineProps<{
  itemId: number
  symbol: string
}>()

const { getItemKline } = useStockQuotes()

const open = defineModel<boolean>()
const currentInterval = ref('1d')
const loading = ref(false)
const klineData = ref<any[]>([])
const itemData = ref<any>(null)

async function loadKlineData() {
  loading.value = true
  try {
    const response = await getItemKline(props.itemId, currentInterval.value)
    klineData.value = response.data
    itemData.value = response.item
  } catch (error) {
    console.error('Failed to load kline data:', error)
  } finally {
    loading.value = false
  }
}

watch(currentInterval, () => {
  if (open.value) {
    loadKlineData()
  }
})

watch(open, (isOpen) => {
  if (isOpen) {
    loadKlineData()
  }
})
</script>

<template>
  <Dialog v-model:open>
    <DialogContent class="max-w-4xl">
      <DialogHeader>
        <DialogTitle>
          {{ symbol }} 详情
        </DialogTitle>
        <DialogDescription>
          {{ itemData?.name || symbol }} - {{ currentInterval }}
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-4">
        <!-- 周期切换 -->
        <div class="flex gap-2">
          <Button
            v-for="interval in ['1d', '1w', '1m']"
            :key="interval"
            :variant="currentInterval === interval ? 'default' : 'outline'"
            size="sm"
            @click="currentInterval = interval"
          >
            {{ interval === '1d' ? '日线' : interval === '1w' ? '周线' : '月线' }}
          </Button>
        </div>

        <!-- OHLC 数据 -->
        <div v-if="!loading && klineData.length > 0" class="grid grid-cols-4 gap-4 text-center">
          <div class="p-4 rounded-lg bg-muted/50">
            <div class="text-sm text-muted-foreground">开</div>
            <div class="text-lg font-semibold">{{ klineData[klineData.length - 1]?.open?.toFixed(2) || '--' }}</div>
          </div>
          <div class="p-4 rounded-lg bg-muted/50">
            <div class="text-sm text-muted-foreground">高</div>
            <div class="text-lg font-semibold">{{ klineData[klineData.length - 1]?.high?.toFixed(2) || '--' }}</div>
          </div>
          <div class="p-4 rounded-lg bg-muted/50">
            <div class="text-sm text-muted-foreground">低</div>
            <div class="text-lg font-semibold">{{ klineData[klineData.length - 1]?.low?.toFixed(2) || '--' }}</div>
          </div>
          <div class="p-4 rounded-lg bg-muted/50">
            <div class="text-sm text-muted-foreground">收</div>
            <div class="text-lg font-semibold">{{ klineData[klineData.length - 1]?.close?.toFixed(2) || '--' }}</div>
          </div>
        </div>

        <!-- 加载状态 -->
        <div v-if="loading" class="flex justify-center py-8">
          <div class="text-muted-foreground">加载中...</div>
        </div>

        <!-- K线图表占位 -->
        <div v-if="!loading && klineData.length > 0" class="h-80 flex items-center justify-center border rounded-lg bg-muted/20">
          <div class="text-center text-muted-foreground">
            <Icon name="bar-chart" :size="48" class="mx-auto mb-2" />
            <p>K线图表组件</p>
            <p class="text-sm">（ApexCharts 或 lightweight-charts）</p>
          </div>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
```

- [ ] **Step 2: 提交**

```bash
git add web/admin/app/components/watchlist/StockDetailDialog.vue
git commit -m "feat: add StockDetailDialog component with kline data display"
```

---

## Task 9: 重构主页面

**Files:**
- Modify: `web/admin/app/pages/watchlist/index.vue`

- [ ] **Step 1: 重构自选股页面**

替换 `web/admin/app/pages/watchlist/index.vue` 内容：

```vue
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useWatchlist, useStockQuotes } from '~/composables'
import { useToast } from 'vue-sonner'
import WatchlistToolbar from '~/components/watchlist/WatchlistToolbar.vue'
import WatchlistTable from '~/components/watchlist/WatchlistTable.vue'
import StockDetailDialog from '~/components/watchlist/StockDetailDialog.vue'
import type { StockQuote } from '~/composables/useStockQuotes'

const { getGroups, deleteGroup } = useWatchlist()
const { getGroupQuotes, refreshGroup } = useStockQuotes()
const toast = useToast()

const groups = ref<any[]>([])
const currentGroupId = ref<number | null>(null)
const quotes = ref<StockQuote[]>([])
const loading = ref(false)
const currentInterval = ref('1d')

const selectedItemId = ref<number | null>(null)
const selectedSymbol = ref('')

async function loadGroups() {
  loading.value = true
  try {
    const data = await getGroups()
    groups.value = data
    if (data.length > 0 && !currentGroupId.value) {
      currentGroupId.value = data[0].id
      await loadQuotes(data[0].id)
    }
  } catch (error) {
    toast.error({
      title: '加载分组失败',
      description: error.message,
    })
  } finally {
    loading.value = false
  }
}

async function loadQuotes(groupId: number) {
  loading.value = true
  try {
    const response = await getGroupQuotes(groupId, currentInterval.value)
    quotes.value = response.quotes
  } catch (error) {
    toast.error({
      title: '加载行情失败',
      description: error.message,
    })
  } finally {
    loading.value = false
  }
}

async function handleRefresh() {
  if (!currentGroupId.value) return
  try {
    await refreshGroup(currentGroupId.value, currentInterval.value)
    await loadQuotes(currentGroupId.value)
    toast.success({
      title: '刷新成功',
      description: '行情数据已更新',
    })
  } catch (error) {
    toast.error({
      title: '刷新失败',
      description: error.message,
    })
  }
}

function handleIntervalChange(interval: string) {
  currentInterval.value = interval
  if (currentGroupId.value) {
    loadQuotes(currentGroupId.value)
  }
}

function handleViewItem(itemId: number, symbol: string) {
  selectedItemId.value = itemId
  selectedSymbol.value = symbol
}

async function handleDeleteGroup(groupId: number) {
  try {
    await deleteGroup(groupId)
    toast.success({
      title: '删除成功',
    })
    await loadGroups()
  } catch (error) {
    toast.error({
      title: '删除失败',
      description: error.message,
    })
  }
}

onMounted(() => {
  loadGroups()
})
</script>

<template>
  <div class="flex h-full">
    <!-- 侧边栏 -->
    <aside class="w-64 border-r bg-card p-4">
      <div class="mb-4">
        <h1 class="text-xl font-bold">自选股</h1>
      </div>

      <div class="space-y-2">
        <div
          v-for="group in groups"
          :key="group.id"
          @click="currentGroupId = group.id; loadQuotes(group.id)"
          :class="[
            'p-3 rounded-lg cursor-pointer transition-colors',
            currentGroupId === group.id ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
          ]"
        >
          <div class="font-medium">{{ group.name }}</div>
          <div class="text-sm opacity-70">{{ group.description }}</div>
        </div>
      </div>

      <div class="mt-4 pt-4 border-t">
        <Button variant="outline" class="w-full">
          <Icon name="plus" :size="16" class="mr-2" />
          新建分组
        </Button>
      </div>
    </aside>

    <!-- 主内容区 -->
    <main class="flex-1 flex flex-col">
      <WatchlistToolbar
        :current-interval="currentInterval"
        @refresh="handleRefresh"
        @set-interval="handleIntervalChange"
      />

      <div class="flex-1 overflow-auto p-4">
        <WatchlistTable
          :quotes="quotes"
          :loading="loading"
        />
      </div>
    </main>

    <!-- 详情弹窗 -->
    <StockDetailDialog
      v-if="selectedItemId"
      :item-id="selectedItemId"
      :symbol="selectedSymbol"
      v-model:open="!!selectedItemId"
      @close="selectedItemId = null; selectedSymbol = ''"
    />
  </div>
</template>
```

- [ ] **Step 2: 提交**

```bash
git add web/admin/app/pages/watchlist/index.vue
git commit -m "feat: refactor watchlist page with new components"
```

---

## Task 10: 添加涨跌色彩 CSS 变量

**Files:**
- Modify: `web/admin/app/assets/css/tailwind.css`

- [ ] **Step 1: 添加涨跌色彩变量**

在 `web/admin/app/assets/css/tailwind.css` 的 `:root` 中添加：

```css
:root {
  /* ... 现有变量 ... */
  
  /* 涨跌色彩 */
  --color-up: oklch(0.65 0.15 160);
  --color-down: oklch(0.60 0.20 25);
  --color-flat: oklch(0.55 0 0);
}

.dark {
  /* ... 现有变量 ... */
  
  /* 涨跌色彩 - dark mode */
  --color-up: oklch(0.65 0.15 160);
  --color-down: oklch(0.60 0.20 25);
  --color-flat: oklch(0.55 0 0);
}
```

- [ ] **Step 2: 提交**

```bash
git add web/admin/app/assets/css/tailwind.css
git commit -m "feat: add up/down/flat color variables for stock quotes"
```

---

## Task 11: Market-Data 多周期接口增强

**Files:**
- Modify: `services/market-data/app/api/kline.py`

- [ ] **Step 1: 检查并增强 K 线接口**

检查 `services/market-data/app/api/kline.py` 是否支持多周期参数：

```python
@router.get("/kline")
async def get_kline(
    symbol: str,
    interval: str = "1d",  # 支持 1d/1w/1m
    limit: int = 100
):
    """
    获取 K 线数据
    
    Args:
        symbol: 股票代码
        interval: 时间周期 (1d/1w/1m)
        limit: 返回条数
    """
    try:
        # 调用数据源获取数据
        data = await fetch_kline_data(symbol, interval, limit)
        return {
            "symbol": symbol,
            "interval": interval,
            "data": data
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

如不支持多周期，需要添加 interval 参数处理逻辑。

- [ ] **Step 2: 提交**

```bash
cd services/market-data
git add app/api/kline.py
git commit -m "feat: add multi-interval support for kline data (1d/1w/1m)"
```

---

## Task 12: 定时任务 - 股票行情同步

**Files:**
- Create: `services/scheduler/app/jobs/sync_stock_quotes.py`

- [ ] **Step 1: 创建股票行情同步任务**

创建 `services/scheduler/app/jobs/sync_stock_quotes.py`：

```python
import asyncio
from datetime import datetime, timedelta
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from pydantic import BaseModel

from ..clients.backend_api import BackendClient
from ..clients.data_api import DataApiClient

# 市场更新时间（北京时间）
MARKET_SCHEDULE = {
    'CN': {'hour': 15, 'minute': 35},   # A股 15:35
    'HK': {'hour': 16, 'minute': 35},   # 港股 16:35
    'US': {'hour': 4, 'minute': 35},    # 美股 04:35 (次日)
}

INTERVALS = ['1d', '1w', '1m']

class SyncJobConfig(BaseModel):
    market: str  # CN/US/HK

async def sync_stock_quotes(config: SyncJobConfig):
    """同步指定市场的股票行情数据"""
    backend = BackendClient()
    data_api = DataApiClient()
    
    # 获取该市场的所有自选股标的
    symbols = await backend.get_watchlist_symbols(config.market)
    
    if not symbols:
        print(f"No symbols found for market {config.market}")
        return
    
    print(f"Syncing {len(symbols)} symbols for {config.market}...")
    
    for interval in INTERVALS:
        try:
            # 调用 market-data 批量获取数据
            quotes = await data_api.get_batch_quotes(
                symbols=symbols,
                interval=interval
            )
            
            # 更新后端数据库
            await backend.update_stock_quotes(
                quotes=quotes,
                interval=interval,
                market=config.market
            )
            
            print(f"  {interval}: {len(quotes)} quotes updated")
            
        except Exception as e:
            print(f"  Error syncing {config.market} {interval}: {e}")
    
    print(f"Sync completed for {config.market}")

# 创建调度器
scheduler = AsyncIOScheduler()

async def setup_jobs():
    """设置定时任务"""
    
    for market, time_config in MARKET_SCHEDULE.items():
        # 计算下次执行时间
        now = datetime.now()
        next_run = now.replace(
            hour=time_config['hour'],
            minute=time_config['minute'],
            second=0,
            microsecond=0
        )
        
        # 如果时间已过，设置到明天
        if next_run <= now:
            next_run += timedelta(days=1)
        
        # 添加定时任务
        scheduler.add_job(
            sync_stock_quotes,
            'cron',
            hour=time_config['hour'],
            minute=time_config['minute'],
            args=[SyncJobConfig(market=market)],
            id=f'sync_{market.lower()}_quotes'
        )
        
        print(f"Scheduled {market} sync at {next_run}")
```

- [ ] **Step 2: 更新 scheduler 主程序**

编辑 `services/scheduler/app/main.py`，添加任务注册。

- [ ] **Step 3: 提交**

```bash
cd services/scheduler
git add app/jobs/sync_stock_quotes.py app/main.py
git commit -m "feat: add stock quotes sync job with market-based scheduling"
```

---

## Task 13: 后端 API 类型导出

**Files:**
- Modify: `api/business/src/types/hono.ts`

- [ ] **Step 1: 添加行情相关类型**

编辑 `api/business/src/types/hono.ts`，添加：

```typescript
export interface StockQuoteResponse {
  group: {
    id: number
    name: string
    itemCount: number
  }
  quotes: Array<{
    itemId: number
    symbol: string
    name: string
    type: string
    exchange: string
    market: string
    sort_order: number
    open: number
    high: number
    low: number
    close: number
    volume: number
    change: number
    changePercent: number
    timestamp: string
    dataDate: string
  }>
  summary: {
    total: number
    up: number
    down: number
    flat: number
  }
}

export interface ReorderRequest {
  itemIds: number[]
}

export interface KlineResponse {
  item: {
    id: number
    symbol: string
    name: string
    type: string
    exchange: string
    market: string
  }
  interval: string
  data: Array<{
    timestamp: string
    open: number
    high: number
    low: number
    close: number
    volume: number
  }>
}
```

- [ ] **Step 2: 提交**

```bash
git add api/business/src/types/hono.ts
git commit -m "feat: add types for watchlist quotes API"
```

---

## Task 14: 测试后端接口

**Files:**
- None (run tests)

- [ ] **Step 1: 启动后端服务**

```bash
cd api/business
pnpm dev
```

- [ ] **Step 2: 测试行情查询接口**

```bash
# 获取 token（先登录）
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "admin123"}'

# 使用 token 测试行情接口
curl -X GET "http://localhost:3000/api/watchlist/groups/1/quotes?interval=1d" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

预期输出：包含 quotes 数组和 summary 的 JSON。

- [ ] **Step 3: 测试手动刷新接口**

```bash
curl -X POST "http://localhost:3000/api/watchlist/groups/1/refresh?interval=1d" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

预期输出：`{"success": true, "updated": 2, "failed": 0}`

- [ ] **Step 4: 测试排序接口**

```bash
curl -X PUT "http://localhost:3000/api/watchlist/groups/1/reorder" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"itemIds": [1, 2, 3]}'
```

预期输出：`{"success": true}`

---

## Task 15: 测试前端页面

**Files:**
- None (run dev server)

- [ ] **Step 1: 启动前端服务**

```bash
cd web/admin
pnpm dev
```

- [ ] **Step 2: 在浏览器中测试**

访问: `http://localhost:3000/watchlist`

验证以下功能：
- [ ] 侧边栏显示分组列表
- [ ] 点击分组切换显示标的
- [ ] 表格正确显示行情数据
- [ ] 点击列标题可以排序
- [ ] 周期切换按钮正常工作
- [ ] 刷新按钮可以更新数据
- [ ] 点击操作按钮可以看到详情弹窗

---

## Task 16: 端到端测试

**Files:**
- None (manual testing)

- [ ] **Step 1: 完整流程测试**

1. 登录系统
2. 进入自选股页面
3. 添加新标的（验证 market-data 集成）
4. 查看标的详情
5. 切换周期（日线/周线/月线）
6. 手动刷新行情
7. 拖拽排序标的
8. 删除标的

- [ ] **Step 2: 测试边界情况**

- [ ] 空分组显示
- [ ] 无网络情况处理
- [ ] 数据过期提示
- [ ] 多市场标的混合显示

- [ ] **Step 3: 性能验证**

- [ ] 大量标的加载（50+）
- [ ] 排序性能
- [ ] 切换周期响应速度

---

## Task 17: 文档更新

**Files:**
- Modify: `docs/superpowers/specs/2026-05-26-watchlist-design.md`

- [ ] **Step 1: 更新设计文档版本**

将文档版本更新为 v1.6，添加实施说明。

- [ ] **Step 2: 提交**

```bash
git add docs/superpowers/specs/2026-05-26-watchlist-design.md
git commit -m "docs: update watchlist design to v1.6 with implementation notes"
```

---

## Task 18: 创建实施计划文档

**Files:**
- Create: `docs/superpowers/plans/2026-05-26-watchlist-implementation.md`

- [ ] **Step 1: 创建实施计划总结文档**

创建 `docs/superpowers/plans/2026-05-26-watchlist-implementation.md`：

```markdown
# 自选股功能实施总结

**完成日期**: 2026-05-26
**版本**: v1.0

## 实施概述

本次实施基于设计文档 `docs/superpowers/specs/2026-05-26-watchlist-design.md`，完成了自选股功能的核心功能。

## 已完成功能

- ✅ 数据库 Schema 扩展（stock_quotes, stock_quote_history 表）
- ✅ 行情查询 API 接口（/quotes, /refresh, /reorder, /kline）
- ✅ 前端组件重构（WatchlistTable, WatchlistToolbar, StockDetailDialog）
- ✅ 行情数据 composable
- ✅ 涨跌色彩系统
- ✅ 周期切换功能（1d/1w/1m）

## 技术要点

1. **分层架构**: 前端 → api/business → stock_quotes → market-data
2. **数据缓存**: 优先查本地缓存，缺失时调用 market-data
3. **多市场支持**: A股(15:35)、港股(16:35)、美股(04:35) 定时更新
4. **响应式设计**: Mobile-first，shadcn-vue 组件

## 后续工作

- [ ] K 线图表组件集成（ApexCharts 或 lightweight-charts）
- [ ] 筛选功能实现（类型/涨跌幅/市场）
- [ ] 虚拟滚动优化
- [ ] 定时任务部署和测试
- [ ] 错误处理和重试机制完善

## 部署清单

- [ ] 应用数据库迁移到生产环境
- [ ] 配置 market-data 服务环境变量
- [ ] 配置 scheduler 服务 cron 任务
- [ ] 更新前端 API 配置
```

- [ ] **Step 2: 提交**

```bash
git add docs/superpowers/plans/2026-05-26-watchlist-implementation.md
git commit -m "docs: add watchlist implementation summary"
```

---

## 验证清单

在实施完成后，验证以下内容：

- [ ] 数据库表正确创建，索引生效
- [ ] API 接口返回正确的数据格式
- [ ] 前端页面正确显示数据
- [ ] 排序功能正常工作
- [ ] 周期切换正确获取数据
- [ ] 手动刷新功能正常
- [ ] 涨跌色彩正确显示
- [ ] 响应式布局在移动端正常
- [ ] 错误情况有友好提示
- [ ] 无 TypeScript 类型错误
- [ ] 无 ESLint 错误

## 回滚计划

如需回滚：

```bash
# 回滚到实施前的状态
git revert HEAD~18

# 或回到特定 commit
git checkout <commit-hash-before-implementation>
```
