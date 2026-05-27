# 个股详情页实现计划

> **For agentic workers:** 必须使用子技能：superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐步实现此计划。步骤使用复选框（`- [ ]`）语法进行跟踪。

**目标：** 在 `/stock/[symbol]` 构建一个综合的股票详情页，包含实时报价、支持区间切换的 K 线图和关键指标。

**架构：** 前端 Nuxt 页面从 business API 获取数据，business API 代理到 market-data 服务。数据缓存在 Redis 中（5分钟 TTL）。图表使用 lightweight-charts 库。

**技术栈：** Nuxt 4, Vue 3, TypeScript, Hono, FastAPI, lightweight-charts, yfinance

---

## 文件结构

**后端 (api/business):**
- `src/routes/stock.ts` - 股票详情端点新路由
- `src/lib/market-data-client.ts` - 扩展股票详情获取器
- `src/types/stock.ts` - 股票详情数据新 TypeScript 类型

**Market-data 服务:**
- `app/api/routes.py` - 添加股票信息端点（包含公司数据和指标）
- `app/services/yfinance_client.py` - 添加扩展股票信息获取方法

**前端 (web/admin):**
- `pages/stock/[symbol].vue` - 个股详情主页面
- `composables/useStockDetail.ts` - 股票详情数据组合式函数
- `components/stock/StockHeader.vue` - 报价头部（价格和 OHLC）
- `components/stock/StockChart.vue` - K线图（支持区间切换）
- `components/stock/StockTabs.vue` - 标签页容器（概览）
- `components/stock/StockOverview.vue` - 关键指标卡片
- `components/stock/StockWatchlistBtn.vue` - 添加/移除自选股按钮

---

## 后端实现

### 任务 1: 添加股票详情的 TypeScript 类型

**文件:**
- 创建: `api/business/src/types/stock.ts`

- [ ] **步骤 1: 创建股票详情类型文件**

```typescript
// 股票详情扩展类型
export interface StockInfo {
  symbol: string          // 股票代码
  name: string            // 股票名称
  nameCn?: string         // 中文名称
  sector?: string         // 行业
  industry?: string       // 细分行业
  website?: string        // 网站
  country?: string        // 国家
  currency: string        // 货币
  exchange: string        // 交易所
  market: string          // 市场
  type: string            // 类型
}

export interface StockMetrics {
  marketCap: number           // 市值
  trailingPE?: number         // 市盈率（TTM）
  forwardPE?: number          // 远期市盈率
  priceToBook?: number        // 市净率
  beta?: number               // Beta系数
  fiftyTwoWeekHigh?: number   // 52周最高
  fiftyTwoWeekLow?: number    // 52周最低
  dividendRate?: number       // 股息
  dividendYield?: number      // 股息率
  eps?: number                // 每股收益
  sharesOutstanding?: number  // 流通股本
}

export interface StockQuoteDetail {
  symbol: string
  name: string
  price: number               // 当前价格
  change: number              // 涨跌额
  changePercent: number       // 涨跌幅
  volume: number              // 成交量
  high: number                // 最高价
  low: number                 // 最低价
  open: number                // 开盘价
  prevClose: number           // 昨收价
  marketCap: number           // 市值
  currency: string            // 货币
  dataDate: string            // 数据日期
}

export interface StockDetailResponse {
  info: StockInfo
  quote: StockQuoteDetail
  metrics: StockMetrics
}

export interface KlinePeriod {
  value: string
  label: string
  days: number
}

export const KLINE_PERIODS: Record<string, KlinePeriod> = {
  '1d': { value: '1d', label: '1天', days: 1 },
  '1w': { value: '1w', label: '1周', days: 7 },
  '1M': { value: '1M', label: '1月', days: 30 },
  '3M': { value: '3M', label: '3月', days: 90 },
  '6M': { value: '6M', label: '6月', days: 180 },
  '1y': { value: '1y', label: '1年', days: 365 },
  '5y': { value: '5y', label: '5年', days: 1825 },
}
```

- [ ] **步骤 2: 导出桶索引**

```typescript
// api/business/src/types/index.ts - 添加导出
export * from './stock'
```

- [ ] **步骤 3: 提交**

```bash
git add api/business/src/types/stock.ts api/business/src/types/index.ts
git commit -m "feat(stock): add TypeScript types for stock detail data"
```

---

### 任务 2: 扩展 market-data 客户端，添加股票详情获取器

**文件:**
- 修改: `api/business/src/lib/market-data-client.ts`

- [ ] **步骤 1: 添加股票详情获取函数**

```typescript
// 在现有接口后添加，在 getQuotes 函数前

interface ServiceStockInfo {
  symbol: string
  name: string
  sector?: string
  industry?: string
  website?: string
  country?: string
  currency: string
}

interface ServiceStockMetrics {
  marketCap: number
  trailingPE?: number
  forwardPE?: number
  priceToBook?: number
  beta?: number
  fiftyTwoWeekHigh?: number
  fiftyTwoWeekLow?: number
  dividendRate?: number
  dividendYield?: number
}

interface ServiceStockDetail {
  info: ServiceStockInfo
  quote: ServiceQuoteData
  metrics: ServiceStockMetrics
}

// 在 getKlines 函数后添加
export async function getStockDetail(symbol: string): Promise<{
  info: {
    symbol: string
    name: string
    sector?: string
    industry?: string
    website?: string
    country?: string
    currency: string
    exchange: string
    market: string
    type: string
  }
  quote: MarketDataQuote
  metrics: {
    marketCap: number
    trailingPE?: number
    forwardPE?: number
    priceToBook?: number
    beta?: number
    fiftyTwoWeekHigh?: number
    fiftyTwoWeekLow?: number
    dividendRate?: number
    dividendYield?: number
  }
}> {
  const url = `${MARKET_DATA_BASE}/api/stock/${symbol}`
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`Market-data service error: ${response.statusText} (${url})`)
  }

  const data = await response.json() as ServiceStockDetail

  // 根据货币确定交易所和市场
  const currency = data.info.currency || 'USD'
  let exchange = 'US'
  let market = 'US'

  if (currency === 'CNY') {
    exchange = 'SH'
    market = 'CN'
  } else if (currency === 'HKD') {
    exchange = 'HK'
    market = 'HK'
  }

  return {
    info: {
      symbol: data.info.symbol,
      name: data.info.name,
      sector: data.info.sector,
      industry: data.info.industry,
      website: data.info.website,
      country: data.info.country,
      currency: data.info.currency,
      exchange,
      market,
      type: 'stock',
    },
    quote: {
      symbol: data.quote.symbol,
      name: data.quote.name || data.info.name,
      type: 'stock',
      exchange,
      price: data.quote.price,
      change: data.quote.change,
      changePercent: data.quote.changePercent,
      volume: data.quote.volume || 0,
      marketCap: data.quote.marketCap || 0,
      prevClose: data.quote.previousClose,
      dataDate: new Date(data.quote.timestamp),
    },
    metrics: {
      marketCap: data.metrics.marketCap || 0,
      trailingPE: data.metrics.trailingPE,
      forwardPE: data.metrics.forwardPE,
      priceToBook: data.metrics.priceToBook,
      beta: data.metrics.beta,
      fiftyTwoWeekHigh: data.metrics.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: data.metrics.fiftyTwoWeekLow,
      dividendRate: data.metrics.dividendRate,
      dividendYield: data.metrics.dividendYield,
    },
  }
}
```

- [ ] **步骤 2: 添加基于周期的K线获取函数**

```typescript
// 在 getStockDetail 函数后添加
export async function getKlinesByPeriod(
  symbol: string,
  interval: string,
  period: string
): Promise<KlineData[]> {
  // 将周期映射到天数
  const periodDays: Record<string, number> = {
    '1d': 1,
    '1w': 7,
    '1M': 30,
    '3M': 90,
    '6M': 180,
    '1y': 365,
    '5y': 1825,
  }

  const days = periodDays[period] || 30
  const limit = days // 基于周期的近似限制

  return getKlines(symbol, interval, limit)
}
```

- [ ] **步骤 3: 提交**

```bash
git add api/business/src/lib/market-data-client.ts
git commit -m "feat(market-data): add stock detail and period-based K-line fetchers"
```

---

### 任务 3: 在 business API 添加股票路由

**文件:**
- 创建: `api/business/src/routes/stock.ts`

- [ ] **步骤 1: 创建股票路由文件**

```typescript
import { Hono } from 'hono'
import { z } from 'zod'
import { db } from '../db'
import { stocks } from '../db/schema-stock'
import { eq } from 'drizzle-orm'
import { ok, fail } from '../lib/response'
import { getStockDetail, getKlinesByPeriod } from '../lib/market-data-client'
import type { StockDetailResponse, KlinePeriod } from '../types/stock'
import { KLINE_PERIODS } from '../types/stock'

const stock = new Hono()

/**
 * GET /api/stock/:symbol
 * 获取综合股票信息，包括报价、公司信息和指标
 */
stock.get('/:symbol', async (c) => {
  const symbol = c.req.param('symbol')?.toUpperCase()

  if (!symbol) {
    return fail(c, 40002, '股票代码不能为空')
  }

  try {
    // 检查股票是否存在于我们的数据库中
    const stockRecord = await db.query.stocks.findFirst({
      where: eq(stocks.symbol, symbol),
    })

    if (!stockRecord) {
      return fail(c, 40002, '未找到该股票代码')
    }

    // 从 market-data 服务获取
    const data = await getStockDetail(symbol)

    // 用数据库数据增强
    const response: StockDetailResponse = {
      info: {
        ...data.info,
        nameCn: stockRecord.name_cn || undefined,
      },
      quote: {
        ...data.quote,
        name: stockRecord.name_cn || stockRecord.name || data.quote.name,
      },
      metrics: data.metrics,
    }

    return ok(c, response)
  } catch (error) {
    console.error('Error fetching stock detail:', error)
    return fail(c, 50301, '行情服务暂时不可用')
  }
})

/**
 * GET /api/stock/:symbol/kline
 * 获取支持周期的K线数据
 */
stock.get('/:symbol/kline', async (c) => {
  const symbol = c.req.param('symbol')?.toUpperCase()

  if (!symbol) {
    return fail(c, 40002, '股票代码不能为空')
  }

  const query = c.req.query()
  const interval = (query.interval || '1d') as string
  const period = (query.period || '3M') as string

  // 验证周期
  if (!KLINE_PERIODS[period]) {
    return fail(c, 40001, `无效的时间范围: ${period}`)
  }

  try {
    const data = await getKlinesByPeriod(symbol, interval, period)
    return ok(c, { symbol, interval, period, data })
  } catch (error) {
    console.error('Error fetching kline data:', error)
    return fail(c, 50301, '行情服务暂时不可用')
  }
})

export default stock
```

- [ ] **步骤 2: 在主应用中注册股票路由**

```typescript
// api/business/src/index.ts - 添加导入并注册
import stock from './routes/stock'

// 在现有路由注册后
app.route('/api/stock', stock)
```

- [ ] **步骤 3: 提交**

```bash
git add api/business/src/routes/stock.ts api/business/src/index.ts
git commit -m "feat(stock): add stock detail API endpoints"
```

---

### 任务 4: 在 market-data 服务添加股票信息端点

**文件:**
- 修改: `services/market-data/app/api/routes.py`
- 修改: `services/market-data/app/api/models.py`

- [ ] **步骤 1: 添加股票信息的 Pydantic 模型**

```python
# services/market-data/app/api/models.py - 在 QuoteData 类后添加

class StockInfo(BaseModel):
    symbol: str
    name: Optional[str] = None
    sector: Optional[str] = None
    industry: Optional[str] = None
    website: Optional[str] = None
    country: Optional[str] = None
    currency: str = "USD"

class StockMetrics(BaseModel):
    marketCap: Optional[float] = None
    trailingPE: Optional[float] = None
    forwardPE: Optional[float] = None
    priceToBook: Optional[float] = None
    beta: Optional[float] = None
    fiftyTwoWeekHigh: Optional[float] = None
    fiftyTwoWeekLow: Optional[float] = None
    dividendRate: Optional[float] = None
    dividendYield: Optional[float] = None

class StockDetailResponse(BaseModel):
    info: StockInfo
    quote: QuoteData
    metrics: StockMetrics
```

- [ ] **步骤 2: 在路由中添加股票信息端点**

```python
# services/market-data/app/api/routes.py - 在 get_quote 函数后添加

@router.get("/stock/{symbol}", response_model=StockDetailResponse)
async def get_stock_detail(symbol: str = Query(..., description="股票代码")):
    """获取股票详细信息，包括公司信息和关键指标"""
    client = get_client(symbol)

    # 获取报价数据
    quote = await client.get_quote(symbol)

    # 从 yfinance 获取扩展信息
    if hasattr(client, '_get_ticker'):
        ticker = await asyncio.to_thread(client._get_ticker, symbol)
        info = await asyncio.to_thread(lambda: ticker.info)

        # 构建股票信息
        stock_info = StockInfo(
            symbol=symbol,
            name=info.get("longName") or info.get("shortName") or symbol,
            sector=info.get("sector"),
            industry=info.get("industry"),
            website=info.get("website"),
            country=info.get("country"),
            currency=info.get("currency", "USD")
        )

        # 构建指标
        metrics = StockMetrics(
            marketCap=safe_float(info.get("marketCap")),
            trailingPE=safe_float(info.get("trailingPE")),
            forwardPE=safe_float(info.get("forwardPE")),
            priceToBook=safe_float(info.get("priceToBook")),
            beta=safe_float(info.get("beta")),
            fiftyTwoWeekHigh=safe_float(info.get("fiftyTwoWeekHigh")),
            fiftyTwoWeekLow=safe_float(info.get("fiftyTwoWeekLow")),
            dividendRate=safe_float(info.get("dividendRate")),
            dividendYield=safe_float(info.get("dividendYield"))
        )

        return StockDetailResponse(
            info=stock_info,
            quote=quote,
            metrics=metrics
        )

    # 无扩展信息时的后备方案
    return StockDetailResponse(
        info=StockInfo(
            symbol=symbol,
            name=quote.name,
            currency=quote.currency
        ),
        quote=quote,
        metrics=StockMetrics()
    )
```

- [ ] **步骤 3: 更新 routes.py 中的导入**

```python
# services/market-data/app/api/routes.py - 更新导入
from .models import (
    QuoteData, QuotesResponse, KlineData, KlineResponse,
    IndicatorsResponse, HealthResponse, StockInfo, StockMetrics, StockDetailResponse
)
```

- [ ] **步骤 4: 提交**

```bash
git add services/market-data/app/api/routes.py services/market-data/app/api/models.py
git commit -m "feat(market-data): add stock info endpoint with company data and metrics"
```

---

## 前端实现

### 任务 5: 创建股票详情组合式函数

**文件:**
- 创建: `web/admin/app/composables/useStockDetail.ts`

- [ ] **步骤 1: 创建股票详情组合式函数**

```typescript
import { ref, readonly, computed } from 'vue'
import type { StockDetailResponse, KlineData, KlinePeriod } from '@/types/stock'
import { KLINE_PERIODS } from '@/types/stock'

export function useStockDetail() {
  const config = useRuntimeConfig()
  const { fetchWithAuth } = useAuth()

  const stockDetail = ref<StockDetailResponse | null>(null)
  const klineData = ref<KlineData[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const currentPeriod = ref<string>('3M')
  const currentInterval = ref<string>('1d')

  const isInWatchlist = ref(false)

  /**
   * 根据股票代码获取股票详情
   */
  async function fetchStockDetail(symbol: string) {
    loading.value = true
    error.value = null

    try {
      const response = await fetchWithAuth<StockDetailResponse>(
        `${config.public.apiBase}/api/stock/${symbol}`
      )
      stockDetail.value = response
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to fetch stock detail'
      console.error('Failed to fetch stock detail:', e)
      throw e
    } finally {
      loading.value = false
    }
  }

  /**
   * 获取股票的K线数据
   */
  async function fetchKlineData(symbol: string) {
    loading.value = true
    error.value = null

    try {
      const response = await fetchWithAuth<{ symbol: string; interval: string; period: string; data: KlineData[] }>(
        `${config.public.apiBase}/api/stock/${symbol}/kline?interval=${currentInterval.value}&period=${currentPeriod.value}`
      )
      klineData.value = response.data
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to fetch kline data'
      console.error('Failed to fetch kline data:', e)
    } finally {
      loading.value = false
    }
  }

  /**
   * 更改时间周期并重新获取K线数据
   */
  function setPeriod(period: string) {
    if (stockDetail.value && KLINE_PERIODS[period]) {
      currentPeriod.value = period
      fetchKlineData(stockDetail.value.info.symbol)
    }
  }

  /**
   * 更改间隔并重新获取K线数据
   */
  function setInterval(interval: string) {
    if (stockDetail.value) {
      currentInterval.value = interval
      fetchKlineData(stockDetail.value.info.symbol)
    }
  }

  /**
   * 刷新所有数据
   */
  async function refresh() {
    if (stockDetail.value) {
      await fetchStockDetail(stockDetail.value.info.symbol)
      await fetchKlineData(stockDetail.value.info.symbol)
    }
  }

  /**
   * 格式化大数字
   */
  function formatLargeNumber(value: number | undefined): string {
    if (value === undefined || value === null) return '-'
    if (value >= 1e12) return `${(value / 1e12).toFixed(2)}万亿`
    if (value >= 1e9) return `${(value / 1e9).toFixed(2)}十亿`
    if (value >= 1e6) return `${(value / 1e6).toFixed(2)}百万`
    if (value >= 1e3) return `${(value / 1e3).toFixed(2)}千`
    return value.toFixed(2)
  }

  /**
   * 格式化百分比
   */
  function formatPercent(value: number | undefined): string {
    if (value === undefined || value === null) return '-'
    return `${value.toFixed(2)}%`
  }

  /**
   * 获取涨跌颜色类（国内习惯：涨红跌绿）
   */
  function getChangeClass(value: number | undefined): string {
    if (!value) return ''
    if (value > 0) return 'text-red-500'
    if (value < 0) return 'text-green-500'
    return ''
  }

  /**
   * 获取涨跌图标
   */
  function getChangeIcon(value: number | undefined): string {
    if (!value) return ''
    if (value > 0) return 'i-lucide-trending-up'
    if (value < 0) return 'i-lucide-trending-down'
    return ''
  }

  return {
    stockDetail: readonly(stockDetail),
    klineData: readonly(klineData),
    loading: readonly(loading),
    error: readonly(error),
    currentPeriod: readonly(currentPeriod),
    currentInterval: readonly(currentInterval),
    isInWatchlist: readonly(isInWatchlist),
    fetchStockDetail,
    fetchKlineData,
    setPeriod,
    setInterval,
    refresh,
    formatLargeNumber,
    formatPercent,
    getChangeClass,
    getChangeIcon,
  }
}
```

- [ ] **步骤 2: 导出桶索引**

```typescript
// web/admin/app/composables/index.ts - 添加导出
export * from './useStockDetail'
```

- [ ] **步骤 3: 提交**

```bash
git add web/admin/app/composables/useStockDetail.ts web/admin/app/composables/index.ts
git commit -m "feat(stock): add stock detail composable"
```

---

### 任务 6: 创建 StockHeader 组件

**文件:**
- 创建: `web/admin/app/components/stock/StockHeader.vue`

- [ ] **步骤 1: 创建 StockHeader 组件**

```vue
<script setup lang="ts">
import type { StockDetailResponse } from '@/types/stock'

interface Props {
  data: StockDetailResponse
}

const props = defineProps<Props>()

const { formatLargeNumber, formatPercent, getChangeClass, getChangeIcon } = useStockDetail()

const quote = computed(() => props.data.quote)
const info = computed(() => props.data.info)
const metrics = computed(() => props.data.metrics)
</script>

<template>
  <div class="space-y-4">
    <!-- 头部：股票代码和名称 -->
    <div class="flex items-start justify-between">
      <div>
        <h1 class="text-3xl font-bold">{{ info.symbol }}</h1>
        <p class="text-lg text-muted-foreground mt-1">
          {{ info.nameCn || info.name }}
        </p>
        <div class="flex items-center gap-2 mt-2">
          <Badge variant="secondary">{{ info.exchange }}</Badge>
          <Badge v-if="info.sector" variant="outline">{{ info.sector }}</Badge>
        </div>
      </div>
      <StockWatchlistBtn :symbol="info.symbol" />
    </div>

    <!-- 价格部分 -->
    <div class="flex items-baseline gap-4">
      <span class="text-4xl font-bold">{{ quote.price.toFixed(2) }}</span>
      <span
        :class="[
          'text-xl font-medium flex items-center gap-1',
          getChangeClass(quote.changePercent)
        ]"
      >
        <Icon :name="getChangeIcon(quote.changePercent)" class="size-5" />
        {{ quote.change > 0 ? '+' : '' }}{{ quote.change.toFixed(2) }}
        ({{ quote.changePercent > 0 ? '+' : '' }}{{ quote.changePercent.toFixed(2) }}%)
      </span>
    </div>

    <!-- OHLC 和成交量 -->
    <div class="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
      <div>
        <span class="text-muted-foreground">今开</span>
        <span class="ml-2 font-medium">{{ quote.open.toFixed(2) }}</span>
      </div>
      <div>
        <span class="text-muted-foreground">最高</span>
        <span :class="['ml-2 font-medium', getChangeClass(quote.high - quote.prevClose)]">
          {{ quote.high.toFixed(2) }}
        </span>
      </div>
      <div>
        <span class="text-muted-foreground">最低</span>
        <span :class="['ml-2 font-medium', getChangeClass(quote.low - quote.prevClose)]">
          {{ quote.low.toFixed(2) }}
        </span>
      </div>
      <div>
        <span class="text-muted-foreground">昨收</span>
        <span class="ml-2 font-medium">{{ quote.prevClose.toFixed(2) }}</span>
      </div>
      <div>
        <span class="text-muted-foreground">成交量</span>
        <span class="ml-2 font-medium">{{ formatLargeNumber(quote.volume) }}</span>
      </div>
    </div>

    <!-- 市值和货币 -->
    <div class="flex items-center gap-6 text-sm text-muted-foreground">
      <span>市值 {{ formatLargeNumber(metrics.marketCap) }}</span>
      <span>货币 {{ info.currency }}</span>
    </div>
  </div>
</template>
```

- [ ] **步骤 2: 提交**

```bash
git add web/admin/app/components/stock/StockHeader.vue
git commit -m "feat(stock): add StockHeader component"
```

---

### 任务 7: 创建支持区间切换的 StockChart 组件

**文件:**
- 创建: `web/admin/app/components/stock/StockChart.vue`

- [ ] **步骤 1: 创建 StockChart 组件**

```vue
<script setup lang="ts">
import { createChart, CandlestickSeries, VolumeSeries, type IChartApi } from 'lightweight-charts'
import type { KlineData } from '@/types/stock'
import { KLINE_PERIODS } from '@/types/stock'

interface Props {
  symbol: string
  data: KlineData[]
  loading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
})

const emit = defineEmits<{
  'period-change': [period: string]
}>()

const currentPeriod = ref<string>('3M')
const chartContainer = ref<HTMLDivElement>()
const chartInstance = ref<IChartApi | null>(null)
const candlestickSeries = ref<ReturnType<IChartApi['addSeries']> | null>(null)
const volumeSeries = ref<ReturnType<IChartApi['addSeries']> | null>(null)

const periods = computed(() => Object.values(KLINE_PERIODS))

/**
 * 初始化 lightweight-charts
 */
function initChart() {
  if (!chartContainer.value) return

  if (chartInstance.value) {
    chartInstance.value.remove()
  }

  const chart = createChart(chartContainer.value, {
    width: chartContainer.value.clientWidth,
    height: 400,
    layout: {
      background: { color: 'transparent' },
      textColor: '#d1d5db',
    },
    grid: {
      vertLines: { color: 'rgba(42, 46, 57, 0.5)' },
      horzLines: { color: 'rgba(42, 46, 57, 0.5)' },
    },
    crosshair: {
      mode: 1,
    },
    rightPriceScale: {
      borderColor: 'rgba(197, 203, 206, 0.8)',
    },
    timeScale: {
      borderColor: 'rgba(197, 203, 206, 0.8)',
      timeVisible: true,
      secondsVisible: false,
    },
  })

  const candlestick = chart.addSeries(CandlestickSeries, {
    upColor: '#ef5350',      // 涨红色（国内习惯）
    downColor: '#26a69a',    // 跌绿色（国内习惯）
    borderVisible: false,
    wickUpColor: '#ef5350',
    wickDownColor: '#26a69a',
  })

  const volume = chart.addSeries(VolumeSeries, {
    color: '#26a69a',
    priceFormat: {
      type: 'volume',
    },
    priceScaleId: '',
  })

  chart.priceScale('').applyOptions({
    scaleMargins: {
      top: 0.8,
      bottom: 0,
    },
  })

  chartInstance.value = chart
  candlestickSeries.value = candlestick
  volumeSeries.value = volume
}

/**
 * 为 lightweight-charts 格式化K线数据
 */
function formatCandlestickData(data: KlineData[]) {
  return data.map(item => ({
    time: item.timestamp,
    open: item.open,
    high: item.high,
    low: item.low,
    close: item.close,
  }))
}

/**
 * 格式化成交量数据
 */
function formatVolumeData(data: KlineData[]) {
  return data.map(item => ({
    time: item.timestamp,
    value: item.volume,
    color: item.close >= item.open ? '#ef535080' : '#26a69a80',
  }))
}

/**
 * 更新图表数据
 */
function updateChart() {
  if (!chartInstance.value || !candlestickSeries.value || !volumeSeries.value) return
  if (props.data.length === 0) return

  const candlestickData = formatCandlestickData(props.data)
  const volumeData = formatVolumeData(props.data)

  candlestickSeries.value.setData(candlestickData)
  volumeSeries.value.setData(volumeData)

  chartInstance.value.timeScale().fitContent()
}

/**
 * 处理周期更改
 */
function handlePeriodChange(period: string) {
  currentPeriod.value = period
  emit('period-change', period)
}

/**
 * 处理窗口大小调整
 */
function handleResize() {
  if (!chartInstance.value || !chartContainer.value) return
  chartInstance.value.applyOptions({
    width: chartContainer.value.clientWidth,
  })
}

watch(() => props.data, () => {
  if (props.data.length > 0) {
    nextTick(() => {
      if (!chartInstance.value) {
        initChart()
      }
      updateChart()
    })
  }
}, { immediate: true })

watch(chartInstance, (instance) => {
  if (instance) {
    window.addEventListener('resize', handleResize)
  }
})

onBeforeUnmount(() => {
  if (chartInstance.value) {
    chartInstance.value.remove()
  }
  window.removeEventListener('resize', handleResize)
})
</script>

<template>
  <Card>
    <CardHeader>
      <div class="flex items-center justify-between">
        <CardTitle>K线图</CardTitle>
        <div class="flex items-center gap-2">
          <Button
            v-for="period in periods"
            :key="period.value"
            :variant="currentPeriod === period.value ? 'default' : 'outline'"
            size="sm"
            @click="handlePeriodChange(period.value)"
          >
            {{ period.label }}
          </Button>
        </div>
      </div>
    </CardHeader>
    <CardContent>
      <div v-if="loading" class="flex items-center justify-center h-[400px]">
        <Icon name="i-lucide-loader-2" class="size-8 animate-spin text-muted-foreground" />
      </div>
      <div v-else-if="data.length === 0" class="flex items-center justify-center h-[400px] text-muted-foreground">
        <div class="text-center">
          <Icon name="i-lucide-chart-line" class="size-12 mx-auto mb-2" />
          <p>暂无K线数据</p>
        </div>
      </div>
      <div v-else ref="chartContainer" class="w-full h-[400px]" />
    </CardContent>
  </Card>
</template>
```

- [ ] **步骤 2: 提交**

```bash
git add web/admin/app/components/stock/StockChart.vue
git commit -m "feat(stock): add StockChart component with range switching"
```

---

### 任务 8: 创建 StockOverview 组件

**文件:**
- 创建: `web/admin/app/components/stock/StockOverview.vue`

- [ ] **步骤 1: 创建 StockOverview 组件**

```vue
<script setup lang="ts">
import type { StockDetailResponse } from '@/types/stock'

interface Props {
  data: StockDetailResponse
}

const props = defineProps<Props>()

const { formatPercent, formatLargeNumber } = useStockDetail()

const metrics = computed(() => props.data.metrics)

const metricCards = computed(() => [
  { label: '市盈率 P/E', value: metrics.value.trailingPE, format: 'number' },
  { label: '市净率 P/B', value: metrics.value.priceToBook, format: 'number' },
  { label: '每股收益', value: metrics.value.eps, format: 'number' },
  { label: '52周高', value: metrics.value.fiftyTwoWeekHigh, format: 'price' },
  { label: '52周低', value: metrics.value.fiftyTwoWeekLow, format: 'price' },
  { label: '股息率', value: metrics.value.dividendYield, format: 'percent' },
  { label: 'Beta', value: metrics.value.beta, format: 'number' },
  { label: '流通股本', value: metrics.value.sharesOutstanding, format: 'large' },
])

function formatValue(value: number | undefined, format: string): string {
  if (value === undefined || value === null) return '-'

  switch (format) {
    case 'percent':
      return `${(value * 100).toFixed(2)}%`
    case 'price':
      return `$${value.toFixed(2)}`
    case 'large':
      return formatLargeNumber(value)
    default:
      return value.toFixed(2)
  }
}
</script>

<template>
  <div class="space-y-4">
    <h3 class="text-lg font-semibold">概览</h3>

    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <Card v-for="metric in metricCards" :key="metric.label">
        <CardContent class="pt-6">
          <p class="text-sm text-muted-foreground">{{ metric.label }}</p>
          <p class="text-2xl font-bold mt-1">{{ formatValue(metric.value, metric.format) }}</p>
        </CardContent>
      </Card>
    </div>

    <!-- 公司信息 -->
    <Card>
      <CardHeader>
        <CardTitle class="text-base">公司信息</CardTitle>
      </CardHeader>
      <CardContent>
        <div class="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          <div v-if="data.info.sector">
            <span class="text-muted-foreground">行业</span>
            <p class="font-medium mt-1">{{ data.info.sector }}</p>
          </div>
          <div v-if="data.info.industry">
            <span class="text-muted-foreground">细分行业</span>
            <p class="font-medium mt-1">{{ data.info.industry }}</p>
          </div>
          <div v-if="data.info.country">
            <span class="text-muted-foreground">国家</span>
            <p class="font-medium mt-1">{{ data.info.country }}</p>
          </div>
          <div v-if="data.info.website" class="md:col-span-2">
            <span class="text-muted-foreground">网站</span>
            <p class="font-medium mt-1">
              <a :href="data.info.website" target="_blank" rel="noopener" class="text-primary hover:underline">
                {{ data.info.website }}
              </a>
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  </div>
</template>
```

- [ ] **步骤 2: 提交**

```bash
git add web/admin/app/components/stock/StockOverview.vue
git commit -m "feat(stock): add StockOverview component"
```

---

### 任务 9: 创建 StockWatchlistBtn 组件

**文件:**
- 创建: `web/admin/app/components/stock/StockWatchlistBtn.vue`

- [ ] **步骤 1: 创建 StockWatchlistBtn 组件**

```vue
<script setup lang="ts">
import type { WatchlistGroup } from '@/composables/useWatchlist'

interface Props {
  symbol: string
}

const props = defineProps<Props>()

const { watchlistGroups, createGroup, addItem } = useWatchlist()
const { fetchWithAuth } = useAuth()
const config = useRuntimeConfig()

const isInWatchlist = ref(false)
const isLoading = ref(false)
const isChecking = ref(true)
const defaultGroupId = ref<number | null>(null)

async function checkWatchlistStatus() {
  isChecking.value = true
  try {
    // 获取默认分组
    const response = await fetchWithAuth<{ groups: WatchlistGroup[] }>(
      `${config.public.apiBase}/api/watchlist/groups`
    )

    const defaultGroup = response.groups.find(g => g.isDefault)
    if (defaultGroup) {
      defaultGroupId.value = defaultGroup.id

      // 检查股票代码是否在默认分组中
      const itemsResponse = await fetchWithAuth<{ items: any[] }>(
        `${config.public.apiBase}/api/watchlist/groups/${defaultGroup.id}/items`
      )

      isInWatchlist.value = itemsResponse.items.some(item => item.symbol === props.symbol)
    }
  } catch (error) {
    console.error('Failed to check watchlist status:', error)
  } finally {
    isChecking.value = false
  }
}

async function toggleWatchlist() {
  if (!defaultGroupId.value || isLoading.value) return

  isLoading.value = true
  try {
    if (isInWatchlist.value) {
      // 查找并删除项目
      const itemsResponse = await fetchWithAuth<{ items: any[] }>(
        `${config.public.apiBase}/api/watchlist/groups/${defaultGroupId.value}/items`
      )

      const item = itemsResponse.items.find(i => i.symbol === props.symbol)
      if (item) {
        await fetchWithAuth(
          `${config.public.apiBase}/api/watchlist/items/${item.id}`,
          { method: 'DELETE' }
        )
        isInWatchlist.value = false
      }
    } else {
      // 添加到自选股
      await fetchWithAuth(
        `${config.public.apiBase}/api/watchlist/groups/${defaultGroupId.value}/items`,
        {
          method: 'POST',
          body: JSON.stringify({ symbol: props.symbol }),
        }
      )
      isInWatchlist.value = true
    }
  } catch (error) {
    console.error('Failed to toggle watchlist:', error)
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  checkWatchlistStatus()
})
</script>

<template>
  <Button
    :variant="isInWatchlist ? 'secondary' : 'default'"
    :size="isInWatchlist ? 'sm' : 'default'"
    :disabled="isChecking || isLoading"
    @click="toggleWatchlist"
  >
    <Icon
      :name="isInWatchlist ? 'i-lucide-star-filled' : 'i-lucide-star'"
      class="size-4 mr-1"
    />
    {{ isInWatchlist ? '已收藏' : '收藏' }}
  </Button>
</template>
```

- [ ] **步骤 2: 提交**

```bash
git add web/admin/app/components/stock/StockWatchlistBtn.vue
git commit -m "feat(stock): add StockWatchlistBtn component"
```

---

### 任务 10: 创建股票详情页面

**文件:**
- 创建: `web/admin/app/pages/stock/[symbol].vue`

- [ ] **步骤 1: 创建股票详情页面**

```vue
<script setup lang="ts">
import type { KlineData } from '@/types/stock'

const route = useRoute()
const { fetchStockDetail, fetchKlineData, setPeriod, loading, error, stockDetail, klineData } = useStockDetail()

const symbol = computed(() => (route.params.symbol as string)?.toUpperCase())

const currentTab = ref('overview')

onMounted(async () => {
  await fetchStockDetail(symbol.value)
  await fetchKlineData(symbol.value)
})

watch(symbol, async (newSymbol) => {
  if (newSymbol) {
    await fetchStockDetail(newSymbol)
    await fetchKlineData(newSymbol)
  }
})

async function handlePeriodChange(period: string) {
  setPeriod(period)
}
</script>

<template>
  <main class="container mx-auto py-6 px-4 max-w-7xl">
    <!-- 加载状态 -->
    <div v-if="loading && !stockDetail" class="flex items-center justify-center h-[50vh]">
      <div class="text-center">
        <Icon name="i-lucide-loader-2" class="size-12 animate-spin text-muted-foreground mx-auto mb-4" />
        <p class="text-muted-foreground">加载中...</p>
      </div>
    </div>

    <!-- 错误状态 -->
    <div v-else-if="error" class="flex items-center justify-center h-[50vh]">
      <div class="text-center">
        <Icon name="i-lucide-alert-circle" class="size-12 text-destructive mx-auto mb-4" />
        <p class="text-destructive">{{ error }}</p>
        <Button variant="outline" class="mt-4" @click="fetchStockDetail(symbol)">
          重试
        </Button>
      </div>
    </div>

    <!-- 内容 -->
    <div v-else-if="stockDetail" class="space-y-6">
      <!-- 头部 -->
      <StockHeader :data="stockDetail" />

      <!-- K线图 -->
      <StockChart
        :symbol="stockDetail.info.symbol"
        :data="klineData"
        :loading="loading"
        @period-change="handlePeriodChange"
      />

      <!-- 标签页 -->
      <Tabs v-model="currentTab">
        <TabsList>
          <TabsTrigger value="overview">概览</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <StockOverview :data="stockDetail" />
        </TabsContent>
      </Tabs>
    </div>
  </main>
</template>
```

- [ ] **步骤 2: 提交**

```bash
git add web/admin/app/pages/stock/[symbol].vue
git commit -m "feat(stock): add stock detail page"
```

---

### 任务 11: 更新自选股列表，导航到详情页

**文件:**
- 修改: `web/admin/app/components/watchlist/WatchlistTable.vue`

- [ ] **步骤 1: 更改点击处理为导航**

```vue
<!-- 替换行上的 @click 事件 -->
<div
  v-for="item in items"
  :key="item.id"
  class="flex items-center justify-between py-3 px-1 hover:bg-muted/30 cursor-pointer transition-colors rounded"
  @click="navigateTo(`/stock/${item.symbol}`)"
>
```

- [ ] **步骤 2: 同时更新查看详情按钮**

```vue
<!-- 更新按钮点击处理 -->
<Button variant="ghost" size="icon" class="size-8" title="查看详情" @click.stop="navigateTo(`/stock/${item.symbol}`)">
  <Icon name="i-lucide-chart-bar" class="size-4" />
</Button>
```

- [ ] **步骤 3: 提交**

```bash
git add web/admin/app/components/watchlist/WatchlistTable.vue
git commit -m "feat(watchlist): navigate to stock detail page on click"
```

---

## 测试

### 任务 12: 手动测试清单

**文件:** 无（手动验证）

- [ ] **步骤 1: 测试 API 端点**

```bash
# 测试股票详情端点
curl http://localhost:3002/api/stock/AAPL

# 测试K线端点
curl "http://localhost:3002/api/stock/AAPL/kline?interval=1d&period=3M"

# 验证响应结构包含 info, quote, metrics
```

- [ ] **步骤 2: 测试 market-data 端点**

```bash
# 测试 market-data 股票信息
curl http://localhost:8000/api/stock/AAPL

# 验证响应包含公司信息和指标
```

- [ ] **步骤 3: 测试前端导航**

1. 启动开发服务器: `pnpm dev:all`
2. 导航到 http://localhost:3000/watchlist
3. 点击股票行
4. 验证导航到 `/stock/[symbol]`
5. 验证头部正确显示
6. 验证K线图加载
7. 测试周期切换（1d, 1w, 1M, 3M, 6M, 1y, 5y）
8. 验证概览标签显示指标
9. 测试添加/移除自选股按钮

- [ ] **步骤 4: 验证错误处理**

1. 导航到 `/stock/INVALID`
2. 验证错误消息显示
3. 验证重试按钮有效

- [ ] **步骤 5: 提交**

```bash
git add -A
git commit -m "test(stock): complete manual testing verification"
```

---

## 自我审查

### 规格覆盖检查

| 规格部分 | 已实现 |
|----------|--------|
| 路由 `/stock/[symbol]` | ✅ 任务 10 |
| 报价头部（价格、涨跌、OHLC） | ✅ 任务 6 |
| K线图（lightweight-charts） | ✅ 任务 7 |
| 时间范围切换（1d-5y） | ✅ 任务 7 |
| 关键指标卡片（P/E, P/B 等） | ✅ 任务 8 |
| 概览标签 | ✅ 任务 10 |
| 股票信息端点 | ✅ 任务 4 |
| K线周期支持 | ✅ 任务 3 |
| 数据库：使用现有 stocks 表 | ✅ 任务 3 |
| 前端组件（Header, Chart, Overview） | ✅ 任务 6, 7, 8 |
| 自选股集成按钮 | ✅ 任务 9 |
| 从自选股列表导航 | ✅ 任务 11 |
| 涨红跌绿（国内习惯） | ✅ 任务 5 (getChangeClass) |

### P2 范围（不在此计划中）
- 财务标签 - 需要单独实现
- 新闻标签 - 需要单独实现

### 类型一致性检查
- 所有类型一致使用 `StockDetailResponse`, `KlineData`, `StockInfo`, `StockMetrics`
- 组合式函数和组件属性与定义的类型匹配
- API 响应结构与前端期望匹配

### 无占位符检查
- 所有代码完整
- 无 "TODO" 或 "TBD"
- 所有函数有完整实现
