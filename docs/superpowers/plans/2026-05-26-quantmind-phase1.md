# QuantMind Phase 1: 核心基础 + 研究站 + 市场中心 + 回测引擎

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 搭建完整的多 Agent 投研分析 + 市场数据 + 策略回测基础平台，用户可以触发分析看 Agent 实时输出，查看自选股 AI 信号，运行策略回测。

**Architecture:** 7 个 Docker 服务（Nuxt/Hono/VoltAgent/LiteLLM/MarketData/Backtest/Scheduler）+ PostgreSQL + Redis + BullMQ。VoltAgent 通过 HTTP Tool 调 MarketData 拿数据，通过 Workflow 编排 7 层 Pipeline，SSE 流式推送到前端。

**Tech Stack:** Nuxt 4 + Hono + VoltAgent + FastAPI + LiteLLM + BullMQ + PostgreSQL + Redis

**设计文档:** `docs/superpowers/specs/2026-05-26-quantmind-design.md`

---

## 文件结构总览

### 新增文件

```
services/agent/
├── package.json
├── tsconfig.json
├── Dockerfile
└── src/
    ├── index.ts                    # VoltAgent 入口 + Hono server
    ├── agents/
    │   ├── technical.ts            # 技术面 Agent
    │   ├── fundamental.ts          # 基本面 Agent
    │   ├── fund-flow.ts            # 资金流 Agent
    │   ├── sentiment.ts            # 情绪 Agent
    │   ├── macro-gate.ts           # 宏观门控 Agent
    │   ├── bull.ts                 # 多头研究员
    │   ├── bear.ts                 # 空头研究员
    │   ├── trader.ts               # 交易员决策
    │   └── risk-manager.ts         # 风险管理
    ├── workflows/
    │   └── research.ts             # 研究站 7 层 Pipeline
    ├── tools/
    │   └── market-data.ts          # Market Data HTTP Tools
    └── prompts/
        └── index.ts                # Prompt 模板集合

services/backtest/
├── requirements.txt
├── Dockerfile
└── app/
    ├── main.py                     # FastAPI 入口
    ├── engine/
    │   ├── __init__.py
    │   ├── core.py                 # 回测引擎核心
    │   ├── strategies.py           # 策略接口
    │   ├── fees.py                 # 费用模型
    │   └── validation.py           # Walk-Forward / Monte Carlo
    ├── routes/
    │   └── backtest.py             # 回测 API 路由
    └── tests/
        └── test_engine.py

infra/litellm/
└── config.yaml                     # LiteLLM 配置

api/business/src/
├── routes/analysis.ts              # 分析任务 API（入队/查询/历史）
├── routes/backtest-proxy.ts        # 回测代理路由
├── queue/
│   ├── index.ts                    # BullMQ 实例
│   ├── analysis.ts                 # 分析任务队列
│   └── backtest.ts                 # 回测任务队列
└── db/schema.ts                    # 扩展：analysis_runs / backtest_runs 表

web/admin/
├── server/api/agent/[...].ts       # VoltAgent 代理路由
├── server/api/backtest/[...].ts    # Backtest 代理路由
└── app/
    ├── pages/
    │   ├── research/
    │   │   ├── index.vue           # 研究站入口
    │   │   └── [ticker].vue        # 分析详情 + SSE 流
    │   ├── strategy/
    │   │   └── backtest.vue        # 回测配置 + 结果
    │   └── market/
    │       └── index.vue           # 市场中心（改版自现有 kanban）
    ├── components/
    │   ├── research/
    │   │   ├── AgentCard.vue       # Agent 输出卡片
    │   │   ├── DebatePanel.vue     # 多空辩论面板
    │   │   └── DecisionCard.vue    # 最终决策卡片
    │   ├── market/
    │   │   ├── WatchlistPanel.vue  # 自选股面板
    │   │   └── SignalBadge.vue     # AI 信号徽章
    │   └── backtest/
    │       ├── ConfigForm.vue      # 回测配置表单
    │       └── ResultPanel.vue     # 回测结果展示
    └── composables/
        ├── useAnalysis.ts          # 分析相关 hooks
        ├── useSSE.ts               # SSE 流式消费
        └── useBacktest.ts          # 回测相关 hooks
```

### 修改文件

```
api/business/src/db/schema.ts           # 新增 analysis_runs / backtest_runs 表
api/business/src/index.ts               # 注册新路由
api/business/package.json               # 新增 bullmq 依赖
services/market-data/app/api/routes.py  # 新增资金流/情绪接口
services/market-data/app/services/      # 新增 ccxt_client / fred_client / sentiment_client
web/admin/app/composables/useWatchlist.ts  # 新增 AI 信号字段
web/admin/nuxt.config.ts               # 新增 VoltAgent/Backtest 代理配置
docker-compose.yml                      # 新增 voltagent / backtest / litellm 服务
```

---

## Task 1: LiteLLM Docker 服务

**Files:**
- Create: `infra/litellm/config.yaml`

- [ ] **Step 1: 创建 LiteLLM 配置文件**

```yaml
# infra/litellm/config.yaml
model_list:
  - model_name: "default"
    litellm_params:
      model: "deepseek/deepseek-chat"
      api_key: "os.environ/DEEPSEEK_API_KEY"

  - model_name: "reasoning"
    litellm_params:
      model: "deepseek/deepseek-reasoner"
      api_key: "os.environ/DEEPSEEK_API_KEY"

  - model_name: "fallback"
    litellm_params:
      model: "openai/qwen-max"
      api_base: "https://dashscope.aliyuncs.com/compatible-mode/v1"
      api_key: "os.environ/QWEN_API_KEY"

router_settings:
  num_retries: 3
  fallbacks: [{"default": ["fallback"]}]
  allowed_fails: 2
```

- [ ] **Step 2: 在 docker-compose.yml 添加 LiteLLM 服务**

在 `docker-compose.yml` 的 `# Backend Services` 区域添加：

```yaml
  litellm:
    image: ghcr.io/berriai/litellm:main-latest
    container_name: trading-agent-litellm
    environment:
      - LITELLM_MASTER_KEY=${LITELLM_MASTER_KEY:-sk-local-dev}
    volumes:
      - ./infra/litellm/config.yaml:/app/config.yaml
    command: [--config, /app/config.yaml, --port, 4000]
    restart: unless-stopped
    networks:
      - trading-net
```

- [ ] **Step 3: 验证 LiteLLM 启动**

```bash
docker compose up litellm -d
docker compose logs litellm --tail 20
# 预期：看到 litellm proxy started on port 4000
```

- [ ] **Step 4: Commit**

```bash
git add infra/litellm/config.yaml docker-compose.yml
git commit -m "feat: add LiteLLM proxy service for unified LLM routing"
```

---

## Task 2: BullMQ 消息队列基础设施

**Files:**
- Create: `api/business/src/queue/index.ts`
- Create: `api/business/src/queue/analysis.ts`
- Create: `api/business/src/queue/backtest.ts`
- Modify: `api/business/package.json`
- Modify: `api/business/src/db/schema.ts`

- [ ] **Step 1: 安装 BullMQ 依赖**

```bash
cd /Users/xuan/Documents/trading-agent && pnpm --filter @trading-agent/api add bullmq
```

- [ ] **Step 2: 创建队列实例**

```typescript
// api/business/src/queue/index.ts
import { Queue, Redis } from 'bullmq'

const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
})

export const analysisQueue = new Queue('analysis', { connection })
export const backtestQueue = new Queue('backtest', { connection })

export { connection }
```

- [ ] **Step 3: 创建分析任务定义**

```typescript
// api/business/src/queue/analysis.ts
export interface AnalysisJobData {
  runId: string
  userId: number
  ticker: string
  market: 'a_stock' | 'hk' | 'us' | 'crypto'
  depth: 'quick' | 'standard' | 'deep'
}

export interface AnalysisJobResult {
  runId: string
  status: 'completed' | 'failed'
  result?: Record<string, unknown>
  error?: string
}
```

- [ ] **Step 4: 创建回测任务定义**

```typescript
// api/business/src/queue/backtest.ts
export interface BacktestJobData {
  runId: string
  userId: number
  strategyCode: string
  strategyType: 'indicator' | 'script'
  config: {
    ticker: string
    market: string
    startDate: string
    endDate: string
    initialCapital: number
    feeModel: 'a_stock' | 'us_stock' | 'crypto'
  }
}

export interface BacktestJobResult {
  runId: string
  status: 'completed' | 'failed'
  metrics?: {
    totalReturn: number
    sharpe: number
    maxDrawdown: number
    winRate: number
    profitFactor: number
    tradeCount: number
  }
  error?: string
}
```

- [ ] **Step 5: 扩展数据库 Schema**

在 `api/business/src/db/schema.ts` 末尾追加：

```typescript
export const analysisRuns = pgTable('analysis_runs', {
  id: serial('id').primaryKey(),
  userId: serial('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  ticker: varchar('ticker', { length: 20 }).notNull(),
  market: varchar('market', { length: 10 }).notNull(),
  depth: varchar('depth', { length: 20 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  result: text('result'),           // JSON string
  layerOutputs: text('layer_outputs'), // JSON string
  llmProvider: varchar('llm_provider', { length: 50 }),
  createdAt: timestamp('created_at').defaultNow(),
  completedAt: timestamp('completed_at'),
})

export const backtestRuns = pgTable('backtest_runs', {
  id: serial('id').primaryKey(),
  userId: serial('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  strategyName: varchar('strategy_name', { length: 100 }).notNull(),
  strategyCode: text('strategy_code').notNull(),
  strategyType: varchar('strategy_type', { length: 20 }).notNull(),
  config: text('config').notNull(),    // JSON string
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  metrics: text('metrics'),            // JSON string
  equityCurve: text('equity_curve'),   // JSON string
  trades: text('trades'),              // JSON string
  error: text('error'),
  createdAt: timestamp('created_at').defaultNow(),
  completedAt: timestamp('completed_at'),
})

export type AnalysisRun = typeof analysisRuns.$inferSelect
export type BacktestRun = typeof backtestRuns.$inferSelect
```

- [ ] **Step 6: 推送 Schema 到数据库**

```bash
cd /Users/xuan/Documents/trading-agent && pnpm --filter @trading-agent/api db:push
```

- [ ] **Step 7: Commit**

```bash
git add api/business/src/queue/ api/business/src/db/schema.ts api/business/package.json pnpm-lock.yaml
git commit -m "feat: add BullMQ queues and analysis/backtest DB schema"
```

---

## Task 3: 分析任务 API 路由

**Files:**
- Create: `api/business/src/routes/analysis.ts`
- Modify: `api/business/src/index.ts`

- [ ] **Step 1: 创建分析路由**

```typescript
// api/business/src/routes/analysis.ts
import { Hono } from 'hono'
import { eq, desc } from 'drizzle-orm'
import { db } from '../db'
import { analysisRuns } from '../db/schema'
import { analysisQueue } from '../queue'
import type { AnalysisJobData } from '../queue/analysis'

const analysis = new Hono()

// 触发分析
analysis.post('/start', async (c) => {
  const user = c.get('user') as { id: number }
  const body = await c.req.json<{ ticker: string; market: string; depth: string }>()

  // 创建分析记录
  const [run] = await db.insert(analysisRuns).values({
    userId: user.id,
    ticker: body.ticker,
    market: body.market,
    depth: body.depth || 'standard',
    status: 'pending',
  }).returning()

  // 入队
  const jobData: AnalysisJobData = {
    runId: String(run.id),
    userId: user.id,
    ticker: body.ticker,
    market: body.market,
    depth: body.depth || 'standard',
  }
  await analysisQueue.add('analyze', jobData, {
    attempts: 2,
    backoff: { type: 'exponential', delay: 5000 },
  })

  return c.json({ runId: run.id, status: 'pending' })
})

// 查询分析状态
analysis.get('/:id', async (c) => {
  const user = c.get('user') as { id: number }
  const id = Number(c.req.param('id'))

  const run = await db.select().from(analysisRuns)
    .where(eq(analysisRuns.id, id))
    .limit(1)

  if (!run.length || run[0].userId !== user.id) {
    return c.json({ error: 'Not found' }, 404)
  }

  return c.json(run[0])
})

// 分析历史列表
analysis.get('/', async (c) => {
  const user = c.get('user') as { id: number }

  const runs = await db.select().from(analysisRuns)
    .where(eq(analysisRuns.userId, user.id))
    .orderBy(desc(analysisRuns.createdAt))
    .limit(50)

  return c.json(runs)
})

export { analysis }
```

- [ ] **Step 2: 注册路由到 Hono app**

在 `api/business/src/index.ts` 添加：

```typescript
import { analysis as analysisRoutes } from './routes/analysis'

// 在已有路由注册下方添加：
app.route('/api/analysis', analysisRoutes)
```

- [ ] **Step 3: Commit**

```bash
git add api/business/src/routes/analysis.ts api/business/src/index.ts
git commit -m "feat: add analysis API routes with BullMQ enqueue"
```

---

## Task 4: VoltAgent 服务骨架

**Files:**
- Create: `services/agent/package.json`
- Create: `services/agent/tsconfig.json`
- Create: `services/agent/src/index.ts`
- Create: `services/agent/Dockerfile`

- [ ] **Step 1: 创建 package.json**

```json
{
  "name": "@trading-agent/agent",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@voltagent/core": "^2.0.0",
    "@voltagent/server-hono": "^2.0.0",
    "@voltagent/logger": "^1.0.0",
    "hono": "^4.7.0",
    "zod": "^3.25.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0"
  }
}
```

- [ ] **Step 2: 创建 tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: 创建入口文件（最小可运行）**

```typescript
// services/agent/src/index.ts
import { Agent, VoltAgent } from '@voltagent/core'
import { createPinoLogger } from '@voltagent/logger'
import { honoServer } from '@voltagent/server-hono'

const logger = createPinoLogger({
  name: 'trading-agent',
  level: 'info',
})

// 占位 Agent，后续 Task 会替换
const healthAgent = new Agent({
  name: 'HealthCheck',
  instructions: 'Health check agent',
  model: 'openai/deepseek-chat',
})

new VoltAgent({
  agents: { healthAgent },
  logger,
  server: honoServer({
    port: 4001,
    basePath: '/agent',
  }),
})
```

- [ ] **Step 4: 创建 Dockerfile**

```dockerfile
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable pnpm
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY services/agent/package.json ./services/agent/package.json
RUN pnpm install --filter=@trading-agent/agent --frozen-lockfile
COPY services/agent ./services/agent
RUN pnpm --filter=@trading-agent/agent exec tsc

FROM node:22-alpine
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY services/agent/package.json ./services/agent/package.json
RUN corepack enable pnpm && \
    pnpm install --filter=@trading-agent/agent --prod --frozen-lockfile && \
    rm -rf /root/.local/share/pnpm /root/.cache
COPY --from=build /app/services/agent/dist ./services/agent/dist
EXPOSE 4001
CMD ["node", "services/agent/dist/index.js"]
```

- [ ] **Step 5: 在 pnpm-workspace.yaml 添加 agent 服务**

确认 `pnpm-workspace.yaml` 包含 `services/*`：

```yaml
packages:
  - 'api/*'
  - 'web/*'
  - 'services/*'
  - 'shared/*'
```

- [ ] **Step 6: 安装依赖验证编译**

```bash
cd /Users/xuan/Documents/trading-agent && pnpm install
pnpm --filter @trading-agent/agent exec tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add services/agent/ pnpm-lock.yaml
git commit -m "feat: scaffold VoltAgent service with basic health agent"
```

---

## Task 5: VoltAgent Market Data Tools

**Files:**
- Create: `services/agent/src/tools/market-data.ts`

- [ ] **Step 1: 创建 Market Data HTTP Tools**

```typescript
// services/agent/src/tools/market-data.ts
import { createTool } from '@voltagent/core'
import { z } from 'zod'

const MARKET_DATA_BASE = process.env.MARKET_DATA_URL || 'http://market-data:8000'

async function fetchFromMarketData(path: string) {
  const res = await fetch(`${MARKET_DATA_BASE}${path}`)
  if (!res.ok) throw new Error(`Market data error: ${res.status}`)
  return res.json()
}

export const getQuoteTool = createTool({
  name: 'get_quote',
  description: '获取股票实时行情（价格、涨跌幅、成交量等）',
  parameters: z.object({
    symbol: z.string().describe('股票代码，如 000001, AAPL, 0700.HK'),
  }),
  execute: async ({ symbol }) => {
    return fetchFromMarketData(`/api/quote?symbol=${encodeURIComponent(symbol)}`)
  },
})

export const getKlineTool = createTool({
  name: 'get_kline',
  description: '获取K线数据（OHLCV）',
  parameters: z.object({
    symbol: z.string().describe('股票代码'),
    interval: z.enum(['1m', '5m', '15m', '1h', '1d', '1w']).default('1d'),
    limit: z.number().default(100),
  }),
  execute: async ({ symbol, interval, limit }) => {
    return fetchFromMarketData(`/api/kline?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=${limit}`)
  },
})

export const getIndicatorsTool = createTool({
  name: 'get_indicators',
  description: '获取技术指标（RSI, MACD, EMA,布林带等）',
  parameters: z.object({
    symbol: z.string().describe('股票代码'),
    indicators: z.string().describe('逗号分隔的指标名，如 rsi,macd,ema'),
    interval: z.string().default('1d'),
    period: z.number().default(100),
  }),
  execute: async ({ symbol, indicators, interval, period }) => {
    return fetchFromMarketData(
      `/api/indicators?symbol=${encodeURIComponent(symbol)}&indicators=${indicators}&interval=${interval}&period=${period}`
    )
  },
})

export const marketDataTools = [getQuoteTool, getKlineTool, getIndicatorsTool]
```

- [ ] **Step 2: Commit**

```bash
git add services/agent/src/tools/
git commit -m "feat: add VoltAgent market data tools (quote, kline, indicators)"
```

---

## Task 6: VoltAgent 投研 Agents 定义

**Files:**
- Create: `services/agent/src/agents/technical.ts`
- Create: `services/agent/src/agents/fundamental.ts`
- Create: `services/agent/src/agents/fund-flow.ts`
- Create: `services/agent/src/agents/sentiment.ts`
- Create: `services/agent/src/agents/macro-gate.ts`
- Create: `services/agent/src/agents/bull.ts`
- Create: `services/agent/src/agents/bear.ts`
- Create: `services/agent/src/agents/trader.ts`
- Create: `services/agent/src/agents/risk-manager.ts`
- Create: `services/agent/src/prompts/index.ts`

- [ ] **Step 1: 创建 Prompt 模板**

```typescript
// services/agent/src/prompts/index.ts
export const TECHNICAL_PROMPT = `你是技术面分析师。根据提供的K线数据和技术指标，分析当前技术面状态。
分析要点：
1. 趋势方向（EMA9/EMA21 位置关系）
2. 动量状态（RSI 数值和斜率）
3. 量价关系（成交量相对水平）
4. 关键支撑/压力位

输出格式：
- 趋势判断：[上涨/下跌/盘整]
- 信号：[看多/看空/中性]
- 关键数据：列出 3-5 个关键指标值
- 分析摘要：2-3 句话概括`

export const FUNDAMENTAL_PROMPT = `你是基本面分析师。根据提供的财报和估值数据，分析公司基本面。
分析要点：
1. 营收增速趋势
2. 盈利能力（ROE、净利润率）
3. 估值水平（PE/PB 相对历史分位）
4. 机构持仓变化

输出格式：
- 基本面评级：[优秀/良好/一般/较差]
- 信号：[看多/看空/中性]
- 关键数据：列出 3-5 个关键财务指标
- 分析摘要：2-3 句话概括`

export const FUND_FLOW_PROMPT = `你是资金流分析师（专注A股）。根据提供的资金流向数据，分析市场资金动向。
分析要点：
1. 北向资金净流入/流出趋势
2. 龙虎榜买卖比
3. 大宗交易折溢价情况
4. 主力资金净流入

输出格式：
- 资金面判断：[流入/流出/平衡]
- 信号：[看多/看空/中性]
- 关键数据：列出资金流相关数据
- 分析摘要：2-3 句话概括`

export const SENTIMENT_PROMPT = `你是市场情绪分析师。根据提供的新闻和社交媒体数据，分析当前市场情绪。
分析要点：
1. 新闻正面/负面比例
2. 社交媒体讨论热度
3. 分析师评级变化
4. 市场恐慌/贪婪指标

输出格式：
- 情绪状态：[贪婪/乐观/中性/悲观/恐惧]
- 信号：[看多/看空/中性]
- 关键数据：情绪相关指标
- 分析摘要：2-3 句话概括`

export const BULL_PROMPT = `你是多头研究员（Bullish）。你的职责是基于提供的数据，找出所有支持上涨的论据。
要求：
1. 从技术面、基本面、资金面、情绪面寻找看多理由
2. 每个论据必须引用具体数据支撑
3. 对可能的看空观点提出反驳
4. 给出目标价位和置信度`

export const BEAR_PROMPT = `你是空头研究员（Bearish）。你的职责是基于提供的数据，找出所有支持下跌的论据。
要求：
1. 从技术面、基本面、资金面、情绪面寻找看空理由
2. 每个论据必须引用具体数据支撑
3. 对可能的看多观点提出反驳
4. 给出目标价位和置信度`

export const TRADER_PROMPT = `你是交易员。综合多头和空头辩论结果，以及历史 Pattern 匹配数据，做出最终交易决策。
要求：
1. 权衡多方和空方论据的强弱
2. 考虑历史相似情境的胜率
3. 考虑当前市场 Regime
4. 给出明确决策：BUY / HOLD / SELL
5. 标注置信度（0-100%）
6. 列出 3 条核心理由`

export const RISK_PROMPT = `你是风险管理师。根据交易员决策，结合用户风险偏好（激进/中立/保守），给出风险调整后的建议。
要求：
1. 评估最大可能亏损
2. 建议仓位比例
3. 建议止损价位
4. 列出主要风险因素
5. 如果风险过大，可以否决交易员决策`

export const MACRO_GATE_PROMPT = `你是宏观门控分析师。判断当前市场所处的 Regime（宏观状态）。
根据提供的数据，判断当前属于哪种状态：
- TRENDING（趋势市）：方向明确，ADX > 25，适合趋势策略
- RANGING（震荡市）：横盘整理，ADX < 20，适合均值回归
- RISK_OFF（避险模式）：VIX 飙升，资金流出，建议保守

输出：Regime 类型 + 置信度 + 影响（后续 Agent 应偏多还是偏空）`
```

- [ ] **Step 2: 创建技术面 Agent**

```typescript
// services/agent/src/agents/technical.ts
import { Agent } from '@voltagent/core'
import { getKlineTool, getIndicatorsTool } from '../tools/market-data'
import { TECHNICAL_PROMPT } from '../prompts'

export const technicalAgent = new Agent({
  name: 'TechnicalAnalyst',
  purpose: '分析技术面指标',
  instructions: TECHNICAL_PROMPT,
  model: 'openai/deepseek-chat',
  tools: [getKlineTool, getIndicatorsTool],
})
```

- [ ] **Step 3: 创建基本面 Agent**

```typescript
// services/agent/src/agents/fundamental.ts
import { Agent } from '@voltagent/core'
import { FUNDAMENTAL_PROMPT } from '../prompts'

export const fundamentalAgent = new Agent({
  name: 'FundamentalAnalyst',
  purpose: '分析基本面数据',
  instructions: FUNDAMENTAL_PROMPT,
  model: 'openai/deepseek-chat',
})
```

- [ ] **Step 4: 创建资金流 Agent**

```typescript
// services/agent/src/agents/fund-flow.ts
import { Agent } from '@voltagent/core'
import { FUND_FLOW_PROMPT } from '../prompts'

export const fundFlowAgent = new Agent({
  name: 'FundFlowAnalyst',
  purpose: '分析资金流向',
  instructions: FUND_FLOW_PROMPT,
  model: 'openai/deepseek-chat',
})
```

- [ ] **Step 5: 创建情绪 Agent**

```typescript
// services/agent/src/agents/sentiment.ts
import { Agent } from '@voltagent/core'
import { SENTIMENT_PROMPT } from '../prompts'

export const sentimentAgent = new Agent({
  name: 'SentimentAnalyst',
  purpose: '分析市场情绪',
  instructions: SENTIMENT_PROMPT,
  model: 'openai/deepseek-chat',
})
```

- [ ] **Step 6: 创建宏观门控 Agent**

```typescript
// services/agent/src/agents/macro-gate.ts
import { Agent } from '@voltagent/core'
import { MACRO_GATE_PROMPT } from '../prompts'

export const macroGateAgent = new Agent({
  name: 'MacroGate',
  purpose: '判断市场 Regime',
  instructions: MACRO_GATE_PROMPT,
  model: 'openai/deepseek-chat',
})
```

- [ ] **Step 7: 创建多空辩论 Agent**

```typescript
// services/agent/src/agents/bull.ts
import { Agent } from '@voltagent/core'
import { BULL_PROMPT } from '../prompts'

export const bullAgent = new Agent({
  name: 'BullishResearcher',
  purpose: '多头研究员',
  instructions: BULL_PROMPT,
  model: 'openai/deepseek-chat',
})
```

```typescript
// services/agent/src/agents/bear.ts
import { Agent } from '@voltagent/core'
import { BEAR_PROMPT } from '../prompts'

export const bearAgent = new Agent({
  name: 'BearishResearcher',
  purpose: '空头研究员',
  instructions: BEAR_PROMPT,
  model: 'openai/deepseek-chat',
})
```

- [ ] **Step 8: 创建交易员和风控 Agent**

```typescript
// services/agent/src/agents/trader.ts
import { Agent } from '@voltagent/core'
import { TRADER_PROMPT } from '../prompts'

export const traderAgent = new Agent({
  name: 'Trader',
  purpose: '综合决策',
  instructions: TRADER_PROMPT,
  model: 'openai/deepseek-chat',
})
```

```typescript
// services/agent/src/agents/risk-manager.ts
import { Agent } from '@voltagent/core'
import { RISK_PROMPT } from '../prompts'

export const riskManagerAgent = new Agent({
  name: 'RiskManager',
  purpose: '风险管理',
  instructions: RISK_PROMPT,
  model: 'openai/deepseek-chat',
})
```

- [ ] **Step 9: Commit**

```bash
git add services/agent/src/agents/ services/agent/src/prompts/
git commit -m "feat: add all research station agents with prompt templates"
```

---

## Task 7: 研究站 Workflow（7 层 Pipeline）

**Files:**
- Create: `services/agent/src/workflows/research.ts`
- Modify: `services/agent/src/index.ts`

- [ ] **Step 1: 创建研究站 Workflow**

```typescript
// services/agent/src/workflows/research.ts
import {
  createWorkflow,
  andThen,
  andAgent,
  andDoWhile,
  andGuardrail,
} from '@voltagent/core'
import { z } from 'zod'
import { technicalAgent } from '../agents/technical'
import { fundamentalAgent } from '../agents/fundamental'
import { fundFlowAgent } from '../agents/fund-flow'
import { sentimentAgent } from '../agents/sentiment'
import { macroGateAgent } from '../agents/macro-gate'
import { bullAgent } from '../agents/bull'
import { bearAgent } from '../agents/bear'
import { traderAgent } from '../agents/trader'
import { riskManagerAgent } from '../agents/risk-manager'

export const researchWorkflow = createWorkflow(
  {
    id: 'research-analysis',
    name: 'Research Analysis Pipeline',
    purpose: '7层投研分析 Pipeline',
    input: z.object({
      ticker: z.string(),
      market: z.enum(['a_stock', 'hk', 'us', 'crypto']),
      depth: z.enum(['quick', 'standard', 'deep']),
      riskStyle: z.enum(['aggressive', 'neutral', 'conservative']).default('neutral'),
    }),
    result: z.object({
      ticker: z.string(),
      decision: z.enum(['BUY', 'HOLD', 'SELL']),
      confidence: z.number(),
      regime: z.string(),
      bullCase: z.string(),
      bearCase: z.string(),
      riskAdvice: z.string(),
      evidenceChain: z.array(z.record(z.unknown())),
    }),
  },

  // Layer 1: 数据采集（技术面）
  andAgent(
    async ({ data }) =>
      `分析 ${data.ticker} 的技术面状态。市场：${data.market}`,
    technicalAgent,
    { schema: z.object({ analysis: z.string(), signal: z.string(), data: z.record(z.unknown()) }) },
  ),

  // Layer 1: 数据采集（基本面）
  andAgent(
    async ({ data }) =>
      `分析 ${data.ticker} 的基本面。市场：${data.market}`,
    fundamentalAgent,
    { schema: z.object({ analysis: z.string(), signal: z.string(), data: z.record(z.unknown()) }) },
  ),

  // Layer 2: 宏观门控
  andAgent(
    async ({ data }) =>
      `判断 ${data.ticker} 当前所处的宏观 Regime。市场：${data.market}`,
    macroGateAgent,
    { schema: z.object({ regime: z.string(), confidence: z.number(), bias: z.string() }) },
  ),

  // Layer 3: 多头辩论
  andAgent(
    async ({ data }) => `作为多头研究员，分析 ${data.ticker} 的上涨理由`,
    bullAgent,
    { schema: z.object({ arguments: z.string(), target: z.string(), confidence: z.number() }) },
  ),

  // Layer 3: 空头辩论
  andAgent(
    async ({ data }) => `作为空头研究员，分析 ${data.ticker} 的下跌理由`,
    bearAgent,
    { schema: z.object({ arguments: z.string(), target: z.string(), confidence: z.number() }) },
  ),

  // Layer 5: 交易员决策
  andAgent(
    async ({ data }) =>
      `综合分析，给出 ${data.ticker} 的交易决策。风险偏好：${data.riskStyle}`,
    traderAgent,
    {
      schema: z.object({
        decision: z.enum(['BUY', 'HOLD', 'SELL']),
        confidence: z.number(),
        reasons: z.array(z.string()),
      }),
    },
  ),

  // Layer 6: 风险管理
  andAgent(
    async ({ data }) =>
      `评估风险，风险偏好：${data.riskStyle}，给出仓位和止损建议`,
    riskManagerAgent,
    {
      schema: z.object({
        advice: z.string(),
        positionSize: z.number(),
        stopLoss: z.number(),
        riskFactors: z.array(z.string()),
      }),
    },
  ),

  // Layer 7: 最终输出整合
  andThen({
    id: 'compile-report',
    execute: async ({ data }) => ({
      ticker: data.ticker,
      decision: data.decision,
      confidence: data.confidence,
      regime: data.regime,
      bullCase: data.arguments,
      bearCase: data.arguments,
      riskAdvice: data.advice,
      evidenceChain: [],
    }),
  }),
)
```

- [ ] **Step 2: 更新 VoltAgent 入口注册 Workflow**

替换 `services/agent/src/index.ts`：

```typescript
import { VoltAgent } from '@voltagent/core'
import { createPinoLogger } from '@voltagent/logger'
import { honoServer } from '@voltagent/server-hono'
import { technicalAgent } from './agents/technical'
import { fundamentalAgent } from './agents/fundamental'
import { fundFlowAgent } from './agents/fund-flow'
import { sentimentAgent } from './agents/sentiment'
import { macroGateAgent } from './agents/macro-gate'
import { bullAgent } from './agents/bull'
import { bearAgent } from './agents/bear'
import { traderAgent } from './agents/trader'
import { riskManagerAgent } from './agents/risk-manager'
import { researchWorkflow } from './workflows/research'

const logger = createPinoLogger({
  name: 'trading-agent',
  level: 'info',
})

new VoltAgent({
  agents: {
    technicalAgent,
    fundamentalAgent,
    fundFlowAgent,
    sentimentAgent,
    macroGateAgent,
    bullAgent,
    bearAgent,
    traderAgent,
    riskManagerAgent,
  },
  workflows: { researchWorkflow },
  logger,
  server: honoServer({
    port: 4001,
    basePath: '/agent',
  }),
})
```

- [ ] **Step 3: Commit**

```bash
git add services/agent/src/workflows/ services/agent/src/index.ts
git commit -m "feat: add research analysis 7-layer pipeline workflow"
```

---

## Task 8: VoltAgent Worker（消费 BullMQ 队列）

**Files:**
- Create: `services/agent/src/worker.ts`
- Modify: `services/agent/src/index.ts`

- [ ] **Step 1: 创建 Worker**

```typescript
// services/agent/src/worker.ts
import { Worker, Redis } from 'bullmq'
import type { AnalysisJobData, AnalysisJobResult } from '../../api/business/src/queue/analysis'

const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
})

const BACKEND_URL = process.env.BACKEND_URL || 'http://api:4000'

export function startAnalysisWorker() {
  const worker = new Worker<AnalysisJobData, AnalysisJobResult>(
    'analysis',
    async (job) => {
      const { runId, ticker, market, depth, userId } = job.data

      try {
        // 调用 VoltAgent workflow API
        const res = await fetch(`http://localhost:4001/agent/workflows/research-analysis`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            input: { ticker, market, depth, riskStyle: 'neutral' },
          }),
        })

        if (!res.ok) throw new Error(`Workflow failed: ${res.status}`)

        const result = await res.json()

        // 回写结果到 Hono API
        await fetch(`${BACKEND_URL}/api/analysis/${runId}/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ result, layerOutputs: result }),
        })

        return { runId, status: 'completed', result }
      } catch (err: any) {
        return { runId, status: 'failed', error: err.message }
      }
    },
    { connection, concurrency: 3 },
  )

  worker.on('completed', (job) => {
    console.log(`Analysis ${job.data.runId} completed`)
  })

  worker.on('failed', (job, err) => {
    console.error(`Analysis ${job?.data.runId} failed:`, err.message)
  })

  return worker
}
```

- [ ] **Step 2: 在入口启动 Worker**

在 `services/agent/src/index.ts` 末尾添加：

```typescript
import { startAnalysisWorker } from './worker'

// 启动 Worker 消费分析队列
if (process.env.START_WORKER !== 'false') {
  startAnalysisWorker()
  console.log('Analysis worker started')
}
```

- [ ] **Step 3: 在 agent package.json 添加 bullmq 依赖**

```bash
pnpm --filter @trading-agent/agent add bullmq
```

- [ ] **Step 4: Commit**

```bash
git add services/agent/src/worker.ts services/agent/src/index.ts services/agent/package.json pnpm-lock.yaml
git commit -m "feat: add BullMQ worker to consume analysis queue and run workflow"
```

---

## Task 9: SSE 推送机制

**Files:**
- Modify: `api/business/src/routes/analysis.ts` — 添加 SSE 端点
- Modify: `services/agent/src/worker.ts` — 添加 Redis Pub/Sub 推送

- [ ] **Step 1: 在分析路由添加 SSE 端点**

在 `api/business/src/routes/analysis.ts` 添加 SSE 路由：

```typescript
analysis.get('/:id/stream', async (c) => {
  const id = c.req.param('id')

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()

      // 轮询数据库状态
      const interval = setInterval(async () => {
        const run = await db.select().from(analysisRuns)
          .where(eq(analysisRuns.id, Number(id)))
          .limit(1)

        if (run.length) {
          const data = run[0]
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))

          if (data.status === 'completed' || data.status === 'failed') {
            clearInterval(interval)
            controller.close()
          }
        }
      }, 2000)
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
})
```

- [ ] **Step 2: 添加完成回调路由**

```typescript
// 在 analysis 路由中添加
analysis.post('/:id/complete', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json()

  await db.update(analysisRuns)
    .set({
      status: 'completed',
      result: JSON.stringify(body.result),
      layerOutputs: JSON.stringify(body.layerOutputs),
      completedAt: new Date(),
    })
    .where(eq(analysisRuns.id, id))

  return c.json({ success: true })
})
```

- [ ] **Step 3: Commit**

```bash
git add api/business/src/routes/analysis.ts
git commit -m "feat: add SSE streaming endpoint for analysis progress"
```

---

## Task 10: 回测服务骨架

**Files:**
- Create: `services/backtest/requirements.txt`
- Create: `services/backtest/app/main.py`
- Create: `services/backtest/app/engine/__init__.py`
- Create: `services/backtest/app/engine/core.py`
- Create: `services/backtest/app/engine/strategies.py`
- Create: `services/backtest/app/engine/fees.py`
- Create: `services/backtest/app/routes/backtest.py`
- Create: `services/backtest/Dockerfile`

- [ ] **Step 1: 创建 requirements.txt**

```
# services/backtest/requirements.txt
fastapi==0.115.0
uvicorn==0.30.0
pandas==2.2.0
numpy==1.26.0
TA-Lib==0.4.28
redis==5.0.0
bullmq==2.0.0
httpx==0.27.0
sqlalchemy==2.0.0
asyncpg==0.29.0
pydantic==2.9.0
```

- [ ] **Step 2: 创建策略接口**

```python
# services/backtest/app/engine/strategies.py
from abc import ABC, abstractmethod
from typing import Optional
import pandas as pd
from pydantic import BaseModel


class Bar(BaseModel):
    time: str
    open: float
    high: float
    low: float
    close: float
    volume: float


class Order(BaseModel):
    side: str  # "buy" or "sell"
    quantity: float
    price: float
    reason: str = ""


class Portfolio(BaseModel):
    cash: float
    positions: dict = {}  # {ticker: {"qty": float, "avg_cost": float}}
    trade_log: list = []


class IndicatorStrategy(ABC):
    """基于 DataFrame 的信号策略"""

    @abstractmethod
    def generate_signals(self, df: pd.DataFrame) -> pd.Series:
        """
        输入：OHLCV DataFrame + 预计算指标
        输出：信号 Series（1=买入, -1=卖出, 0=持有）
        """
        pass


class ScriptStrategy(ABC):
    """事件驱动策略"""

    @abstractmethod
    def on_bar(self, bar: Bar, portfolio: Portfolio) -> Optional[Order]:
        pass

    def on_order_filled(self, order: Order, portfolio: Portfolio):
        pass
```

- [ ] **Step 3: 创建费用模型**

```python
# services/backtest/app/engine/fees.py
from dataclasses import dataclass


@dataclass
class FeeModel:
    """交易费用模型"""
    commission_rate: float = 0.0003  # 佣金率
    min_commission: float = 5.0      # 最低佣金
    stamp_tax_rate: float = 0.0       # 印花税（仅卖出）
    slippage_rate: float = 0.0        # 滑点率


FEE_MODELS = {
    "a_stock": FeeModel(
        commission_rate=0.0003,
        min_commission=5.0,
        stamp_tax_rate=0.001,  # 卖方印花税 0.1%
        slippage_rate=0.001,
    ),
    "us_stock": FeeModel(
        commission_rate=0.0,  # 美股常见零佣金
        min_commission=0.0,
        stamp_tax_rate=0.0,
        slippage_rate=0.001,
    ),
    "crypto": FeeModel(
        commission_rate=0.001,  # maker 0.1%
        min_commission=0.0,
        stamp_tax_rate=0.0,
        slippage_rate=0.002,
    ),
}


def calculate_fee(price: float, quantity: float, side: str, fee_model: FeeModel) -> float:
    """计算交易费用"""
    trade_value = price * quantity

    # 佣金
    commission = max(trade_value * fee_model.commission_rate, fee_model.min_commission)

    # 印花税（仅卖出）
    stamp_tax = 0.0
    if side == "sell":
        stamp_tax = trade_value * fee_model.stamp_tax_rate

    # 滑点
    slippage = trade_value * fee_model.slippage_rate

    return commission + stamp_tax + slippage
```

- [ ] **Step 4: 创建回测引擎核心**

```python
# services/backtest/app/engine/core.py
import pandas as pd
import numpy as np
from typing import Optional
from .strategies import IndicatorStrategy, Portfolio, Order
from .fees import FEE_MODELS, calculate_fee


class BacktestEngine:
    """回测引擎"""

    def __init__(
        self,
        strategy: IndicatorStrategy,
        df: pd.DataFrame,
        initial_capital: float = 1000000.0,
        fee_model_name: str = "a_stock",
    ):
        self.strategy = strategy
        self.df = df
        self.initial_capital = initial_capital
        self.fee_model = FEE_MODELS.get(fee_model_name, FEE_MODELS["a_stock"])

    def run(self) -> dict:
        """执行回测"""
        # 生成信号
        signals = self.strategy.generate_signals(self.df)

        # 初始化组合
        cash = self.initial_capital
        position = 0.0
        entry_price = 0.0
        trades = []
        equity_curve = []

        for i in range(len(self.df)):
            row = self.df.iloc[i]
            signal = int(signals.iloc[i]) if i < len(signals) else 0
            price = row["close"]

            # 买入信号
            if signal == 1 and position == 0 and cash > 0:
                quantity = cash / price
                fee = calculate_fee(price, quantity, "buy", self.fee_model)
                cash -= cash + fee  # 全仓买入
                cash = -fee
                position = quantity
                entry_price = price
                trades.append({
                    "time": str(row.name) if row.name else str(i),
                    "side": "buy",
                    "price": price,
                    "quantity": quantity,
                    "fee": fee,
                })

            # 卖出信号
            elif signal == -1 and position > 0:
                fee = calculate_fee(price, position, "sell", self.fee_model)
                proceeds = position * price - fee
                pnl = proceeds - (position * entry_price)
                cash = proceeds
                trades.append({
                    "time": str(row.name) if row.name else str(i),
                    "side": "sell",
                    "price": price,
                    "quantity": position,
                    "fee": fee,
                    "pnl": pnl,
                })
                position = 0.0

            # 记录权益
            equity = cash + position * price
            equity_curve.append(equity)

        # 计算指标
        metrics = self._calculate_metrics(equity_curve, trades)
        return {
            "metrics": metrics,
            "equity_curve": equity_curve,
            "trades": trades,
        }

    def _calculate_metrics(self, equity_curve: list, trades: list) -> dict:
        """计算回测指标"""
        if not equity_curve or len(equity_curve) < 2:
            return {"totalReturn": 0, "sharpe": 0, "maxDrawdown": 0, "winRate": 0, "profitFactor": 0, "tradeCount": 0}

        equity = pd.Series(equity_curve)
        returns = equity.pct_change().dropna()

        total_return = (equity.iloc[-1] / self.initial_capital) - 1

        # Sharpe Ratio（年化，假设日频）
        sharpe = (returns.mean() / returns.std()) * np.sqrt(252) if returns.std() > 0 else 0

        # 最大回撤
        peak = equity.cummax()
        drawdown = (equity - peak) / peak
        max_drawdown = drawdown.min()

        # 胜率
        closed_trades = [t for t in trades if t.get("pnl") is not None]
        wins = [t for t in closed_trades if t["pnl"] > 0]
        win_rate = len(wins) / len(closed_trades) if closed_trades else 0

        # 盈亏比
        total_profit = sum(t["pnl"] for t in closed_trades if t["pnl"] > 0)
        total_loss = abs(sum(t["pnl"] for t in closed_trades if t["pnl"] < 0))
        profit_factor = total_profit / total_loss if total_loss > 0 else float('inf')

        return {
            "totalReturn": round(total_return, 4),
            "sharpe": round(float(sharpe), 4),
            "maxDrawdown": round(float(max_drawdown), 4),
            "winRate": round(win_rate, 4),
            "profitFactor": round(profit_factor, 4),
            "tradeCount": len(closed_trades),
        }
```

- [ ] **Step 5: 创建 FastAPI 路由**

```python
# services/backtest/app/routes/backtest.py
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import pandas as pd
import httpx
import json
import sys
import os

# 添加父目录到路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from engine.core import BacktestEngine
from engine.strategies import IndicatorStrategy

router = APIRouter(prefix="/api")

MARKET_DATA_URL = os.environ.get("MARKET_DATA_URL", "http://market-data:8000")


class BacktestRequest(BaseModel):
    strategy_code: str
    ticker: str
    market: str = "a_stock"
    start_date: str
    end_date: str
    initial_capital: float = 1000000.0
    fee_model: str = "a_stock"


class BacktestResponse(BaseModel):
    status: str
    metrics: Optional[dict] = None
    equity_curve: Optional[list] = None
    trades: Optional[list] = None
    error: Optional[str] = None


@router.post("/run", response_model=BacktestResponse)
async def run_backtest(req: BacktestRequest):
    try:
        # 获取K线数据
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{MARKET_DATA_URL}/api/kline",
                params={"symbol": req.ticker, "interval": "1d", "limit": 500},
            )
            resp.raise_for_status()
            kline_data = resp.json()

        if not kline_data.get("data"):
            raise HTTPException(status_code=404, detail="No kline data found")

        # 构建 DataFrame
        df = pd.DataFrame(kline_data["data"])
        df["time"] = pd.to_datetime(df["time"])
        df = df.set_index("time")
        for col in ["open", "high", "low", "close", "volume"]:
            df[col] = pd.to_numeric(df[col], errors="coerce")

        # 过滤日期范围
        df = df[req.start_date:req.end_date]

        if len(df) < 10:
            raise HTTPException(status_code=400, detail="Insufficient data for backtest")

        # 动态执行用户策略代码
        local_ns = {"pd": pd, "np": __import__("numpy"), "IndicatorStrategy": IndicatorStrategy}
        exec(req.strategy_code, local_ns)

        # 找到策略类
        strategy_class = None
        for v in local_ns.values():
            if isinstance(v, type) and issubclass(v, IndicatorStrategy) and v is not IndicatorStrategy:
                strategy_class = v
                break

        if not strategy_class:
            raise HTTPException(status_code=400, detail="No IndicatorStrategy subclass found in code")

        strategy = strategy_class()

        # 运行回测
        engine = BacktestEngine(
            strategy=strategy,
            df=df,
            initial_capital=req.initial_capital,
            fee_model_name=req.fee_model,
        )
        result = engine.run()

        return BacktestResponse(status="completed", **result)

    except HTTPException:
        raise
    except Exception as e:
        return BacktestResponse(status="failed", error=str(e))


@router.get("/health")
async def health():
    return {"status": "ok"}
```

- [ ] **Step 6: 创建 FastAPI 入口**

```python
# services/backtest/app/main.py
from fastapi import FastAPI
from .routes.backtest import router

app = FastAPI(title="QuantMind Backtest Service", version="1.0.0")
app.include_router(router)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8002)
```

- [ ] **Step 7: 创建 Dockerfile**

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# TA-Lib 系统依赖
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential wget && \
    wget http://prdownloads.sourceforge.net/ta-lib/ta-lib-0.4.0-src.tar.gz && \
    tar -xzf ta-lib-0.4.0-src.tar.gz && \
    cd ta-lib-0.4.0 && ./configure && make && make install && \
    cd .. && rm -rf ta-lib-0.4.0 ta-lib-0.4.0-src.tar.gz && \
    ldconfig && \
    apt-get purge -y build-essential wget && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app/ ./app/

EXPOSE 8002
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8002"]
```

- [ ] **Step 8: Commit**

```bash
git add services/backtest/
git commit -m "feat: add backtest service with engine, fee models, and API routes"
```

---

## Task 11: Docker Compose 更新

**Files:**
- Modify: `docker-compose.yml`

- [ ] **Step 1: 添加 VoltAgent / Backtest / LiteLLM 服务**

在 `docker-compose.yml` 的 Backend Services 区域添加：

```yaml
  voltagent:
    build:
      context: .
      dockerfile: ./services/agent/Dockerfile
    container_name: trading-agent-voltagent
    ports:
      - "4001:4001"
    environment:
      - REDIS_URL=redis://redis:6379/0
      - MARKET_DATA_URL=http://market-data:8000
      - BACKEND_URL=http://api:4000
      - OPENAI_API_KEY=${DEEPSEEK_API_KEY}
      - OPENAI_BASE_URL=http://litellm:4000
      - START_WORKER=true
    depends_on:
      - redis
      - market-data
      - litellm
    restart: unless-stopped
    networks:
      - trading-net

  backtest:
    build: ./services/backtest
    container_name: trading-agent-backtest
    ports:
      - "8002:8002"
    environment:
      - REDIS_URL=redis://redis:6379/0
      - MARKET_DATA_URL=http://market-data:8000
    depends_on:
      - redis
      - market-data
    restart: unless-stopped
    networks:
      - trading-net
```

- [ ] **Step 2: 更新 Hono API 环境变量**

在 `api` 服务的 environment 中添加：

```yaml
      - VOLTAGENT_URL=http://voltagent:4001
      - BACKTEST_URL=http://backtest:8002
```

- [ ] **Step 3: 验证全部服务启动**

```bash
docker compose build
docker compose up -d
docker compose ps
# 预期：所有 8 个服务 running
```

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml
git commit -m "feat: add voltagent, backtest, litellm to docker compose"
```

---

## Task 12: Nuxt 代理路由扩展

**Files:**
- Modify: `web/admin/server/api/[...].ts`
- Modify: `web/admin/nuxt.config.ts`

- [ ] **Step 1: 扩展 Nuxt proxy 支持多后端**

替换 `web/admin/server/api/[...].ts`：

```typescript
const SERVICE_MAP: Record<string, string> = {
  '/api/auth': 'apiBaseInternal',
  '/api/watchlist': 'apiBaseInternal',
  '/api/analysis': 'apiBaseInternal',
  '/api/backtest': 'backtestInternal',
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const path = event.path

  // 匹配服务
  let target: string
  if (path.startsWith('/api/agent')) {
    target = config.agentInternal || 'http://voltagent:4001'
    // 去掉 /api 前缀，VoltAgent 挂载在 /agent
    path.replace('/api/agent', '/agent')
  } else {
    // 查找匹配的服务
    const matchedKey = Object.keys(SERVICE_MAP)
      .sort((a, b) => b.length - a.length)
      .find(key => path.startsWith(key))

    if (matchedKey) {
      const configKey = SERVICE_MAP[matchedKey]
      target = config[configKey as keyof typeof config] as string
        || (configKey === 'apiBaseInternal' ? 'http://api:4000' : 'http://backtest:8002')
    } else {
      target = config.apiBaseInternal || 'http://api:4000'
    }
  }

  try {
    const body = ['POST', 'PUT', 'PATCH'].includes(event.method)
      ? await readRawBody(event)
      : undefined

    const response = await fetch(target + event.path, {
      method: event.method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: event.headers.get('Authorization') || '',
      },
      body,
    })

    const data = await response.json()
    setResponseStatus(event, response.status)
    return data
  } catch (err: any) {
    setResponseStatus(event, 502)
    return { success: false, error: err.message || 'Proxy error' }
  }
})
```

- [ ] **Step 2: 更新 Nuxt 配置添加内部服务地址**

在 `web/admin/nuxt.config.ts` 的 runtimeConfig 中添加：

```typescript
runtimeConfig: {
  apiBaseInternal: process.env.NUXT_API_PROXY_TARGET || 'http://api:4000',
  agentInternal: process.env.NUXT_AGENT_PROXY_TARGET || 'http://voltagent:4001',
  backtestInternal: process.env.NUXT_BACKTEST_PROXY_TARGET || 'http://backtest:8002',
  public: {
    apiBase: process.env.NUXT_PUBLIC_API_BASE || '',
    marketDataApiBase: process.env.NUXT_PUBLIC_MARKET_DATA_API_BASE || 'http://localhost:8000',
  },
},
```

- [ ] **Step 3: Commit**

```bash
git add web/admin/server/api/[...].ts web/admin/nuxt.config.ts
git commit -m "feat: extend Nuxt proxy to support VoltAgent and Backtest services"
```

---

## Task 13: 前端 — SSE Hook

**Files:**
- Create: `web/admin/app/composables/useSSE.ts`

- [ ] **Step 1: 创建 SSE composable**

```typescript
// web/admin/app/composables/useSSE.ts
export function useAnalysisStream(runId: Ref<string | number>) {
  const status = ref<'connecting' | 'streaming' | 'completed' | 'failed'>('connecting')
  const data = ref<Record<string, any> | null>(null)
  const layers = ref<any[]>([])
  const error = ref<string | null>(null)

  const config = useRuntimeConfig()
  const baseUrl = config.public.apiBase || ''

  let eventSource: EventSource | null = null

  const connect = () => {
    status.value = 'connecting'

    eventSource = new EventSource(`${baseUrl}/api/analysis/${runId.value}/stream`)

    eventSource.onopen = () => {
      status.value = 'streaming'
    }

    eventSource.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data)
        data.value = parsed

        if (parsed.status === 'completed') {
          status.value = 'completed'
          eventSource?.close()
        } else if (parsed.status === 'failed') {
          status.value = 'failed'
          error.value = 'Analysis failed'
          eventSource?.close()
        }
      } catch {
        // ignore parse errors
      }
    }

    eventSource.onerror = () => {
      error.value = 'Connection lost'
      status.value = 'failed'
      eventSource?.close()
    }
  }

  const disconnect = () => {
    eventSource?.close()
    eventSource = null
  }

  onMounted(connect)
  onUnmounted(disconnect)

  watch(runId, () => {
    disconnect()
    connect()
  })

  return { status, data, layers, error, connect, disconnect }
}
```

- [ ] **Step 2: Commit**

```bash
git add web/admin/app/composables/useSSE.ts
git commit -m "feat: add SSE composable for real-time analysis streaming"
```

---

## Task 14: 前端 — 研究站页面

**Files:**
- Create: `web/admin/app/pages/research/index.vue`
- Create: `web/admin/app/pages/research/[ticker].vue`
- Create: `web/admin/app/composables/useAnalysis.ts`
- Create: `web/admin/app/components/research/AgentCard.vue`
- Create: `web/admin/app/components/research/DecisionCard.vue`

- [ ] **Step 1: 创建分析 composable**

```typescript
// web/admin/app/composables/useAnalysis.ts
export function useAnalysis() {
  const config = useRuntimeConfig()
  const baseUrl = config.public.apiBase || ''

  const triggerAnalysis = async (ticker: string, market: string = 'a_stock', depth: string = 'standard') => {
    const token = useCookie('token')

    const res = await $fetch<{ runId: number; status: string }>(`${baseUrl}/api/analysis/start`, {
      method: 'POST',
      body: { ticker, market, depth },
      headers: { Authorization: `Bearer ${token.value}` },
    })

    return res
  }

  const getAnalysisHistory = async () => {
    const token = useCookie('token')

    const res = await $fetch(`${baseUrl}/api/analysis`, {
      headers: { Authorization: `Bearer ${token.value}` },
    })

    return res
  }

  return { triggerAnalysis, getAnalysisHistory }
}
```

- [ ] **Step 2: 创建研究站首页**

```vue
<!-- web/admin/app/pages/research/index.vue -->
<template>
  <div class="p-6 max-w-4xl mx-auto">
    <h1 class="text-2xl font-bold mb-6">研究站</h1>

    <!-- 分析输入 -->
    <div class="flex gap-4 mb-8">
      <input
        v-model="ticker"
        placeholder="输入股票代码，如 000001, AAPL"
        class="flex-1 border rounded px-4 py-2"
        @keyup.enter="startAnalysis"
      />
      <select v-model="market" class="border rounded px-4 py-2">
        <option value="a_stock">A股</option>
        <option value="hk">港股</option>
        <option value="us">美股</option>
        <option value="crypto">加密</option>
      </select>
      <select v-model="depth" class="border rounded px-4 py-2">
        <option value="quick">快速</option>
        <option value="standard">标准</option>
        <option value="deep">深度</option>
      </select>
      <button
        class="bg-primary text-white px-6 py-2 rounded"
        :disabled="loading"
        @click="startAnalysis"
      >
        {{ loading ? '分析中...' : '开始分析' }}
      </button>
    </div>

    <!-- 分析历史 -->
    <h2 class="text-lg font-semibold mb-4">分析历史</h2>
    <div v-if="history.length" class="space-y-3">
      <NuxtLink
        v-for="run in history"
        :key="run.id"
        :to="`/research/${run.ticker}?runId=${run.id}`"
        class="block border rounded p-4 hover:bg-muted"
      >
        <div class="flex justify-between">
          <span class="font-medium">{{ run.ticker }}</span>
          <span class="text-sm text-muted">{{ run.createdAt }}</span>
        </div>
        <div class="text-sm text-muted">{{ run.market }} · {{ run.depth }} · {{ run.status }}</div>
      </NuxtLink>
    </div>
    <div v-else class="text-muted">暂无分析记录</div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const ticker = ref('')
const market = ref('a_stock')
const depth = ref('standard')
const loading = ref(false)
const history = ref<any[]>([])

const { triggerAnalysis, getAnalysisHistory } = useAnalysis()

const startAnalysis = async () => {
  if (!ticker.value) return
  loading.value = true
  try {
    const res = await triggerAnalysis(ticker.value, market.value, depth.value)
    navigateTo(`/research/${ticker.value}?runId=${res.runId}`)
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  history.value = await getAnalysisHistory() as any[]
})
</script>
```

- [ ] **Step 3: 创建 Agent 输出卡片组件**

```vue
<!-- web/admin/app/components/research/AgentCard.vue -->
<template>
  <div class="border rounded-lg p-4" :class="borderColor">
    <div class="flex items-center justify-between mb-2">
      <span class="font-semibold" :class="textColor">{{ agentName }}</span>
      <span class="text-xs text-muted">{{ timestamp }}</span>
    </div>
    <div class="text-sm whitespace-pre-wrap">{{ content }}</div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  agentName: string
  content: string
  role: 'data' | 'debate' | 'decision' | 'risk'
  timestamp?: string
}>()

const borderColor = computed(() => {
  switch (props.role) {
    case 'data': return 'border-blue-300 bg-blue-50 dark:bg-blue-950'
    case 'debate': return 'border-yellow-300 bg-yellow-50 dark:bg-yellow-950'
    case 'decision': return 'border-green-300 bg-green-50 dark:bg-green-950'
    case 'risk': return 'border-red-300 bg-red-50 dark:bg-red-950'
    default: return 'border-gray-300'
  }
})

const textColor = computed(() => {
  switch (props.role) {
    case 'data': return 'text-blue-700 dark:text-blue-300'
    case 'debate': return 'text-yellow-700 dark:text-yellow-300'
    case 'decision': return 'text-green-700 dark:text-green-300'
    case 'risk': return 'text-red-700 dark:text-red-300'
    default: return ''
  }
})
</script>
```

- [ ] **Step 4: 创建决策卡片组件**

```vue
<!-- web/admin/app/components/research/DecisionCard.vue -->
<template>
  <div class="border-2 rounded-lg p-6 text-center" :class="decisionBorder">
    <div class="text-4xl font-bold mb-2" :class="decisionText">
      {{ decision }}
    </div>
    <div class="text-lg text-muted">
      置信度 {{ confidence }}%
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  decision: 'BUY' | 'HOLD' | 'SELL'
  confidence: number
}>()

const decisionBorder = computed(() => {
  switch (props.decision) {
    case 'BUY': return 'border-green-500 bg-green-50 dark:bg-green-950'
    case 'HOLD': return 'border-yellow-500 bg-yellow-50 dark:bg-yellow-950'
    case 'SELL': return 'border-red-500 bg-red-50 dark:bg-red-950'
    default: return ''
  }
})

const decisionText = computed(() => {
  switch (props.decision) {
    case 'BUY': return 'text-green-600'
    case 'HOLD': return 'text-yellow-600'
    case 'SELL': return 'text-red-600'
    default: return ''
  }
})
</script>
```

- [ ] **Step 5: 创建分析详情页（含 SSE）**

```vue
<!-- web/admin/app/pages/research/[ticker].vue -->
<template>
  <div class="p-6 max-w-4xl mx-auto">
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold">{{ ticker }} 分析</h1>
      <span class="text-sm px-3 py-1 rounded-full" :class="statusClass">
        {{ statusLabel }}
      </span>
    </div>

    <!-- SSE 实时输出 -->
    <div v-if="status === 'streaming' || status === 'completed'" class="space-y-4 mb-8">
      <ResearchAgentCard
        v-for="(layer, i) in parsedLayers"
        :key="i"
        :agent-name="layer.name"
        :content="layer.content"
        :role="layer.role"
      />
    </div>

    <!-- 最终决策 -->
    <ResearchDecisionCard
      v-if="finalDecision"
      :decision="finalDecision.decision"
      :confidence="finalDecision.confidence"
    />

    <!-- 加载中 -->
    <div v-if="status === 'connecting'" class="text-center py-12">
      <div class="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
      <p>正在连接分析服务...</p>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const route = useRoute()
const ticker = route.params.ticker as string
const runId = ref(route.query.runId as string || '')

const { status, data, error } = useAnalysisStream(runId)

const statusLabel = computed(() => {
  switch (status.value) {
    case 'connecting': return '连接中'
    case 'streaming': return '分析中'
    case 'completed': return '分析完成'
    case 'failed': return '分析失败'
    default: return ''
  }
})

const statusClass = computed(() => {
  switch (status.value) {
    case 'streaming': return 'bg-blue-100 text-blue-800'
    case 'completed': return 'bg-green-100 text-green-800'
    case 'failed': return 'bg-red-100 text-red-800'
    default: return 'bg-gray-100 text-gray-800'
  }
})

const parsedLayers = computed(() => {
  if (!data.value?.layerOutputs) return []
  try {
    const outputs = typeof data.value.layerOutputs === 'string'
      ? JSON.parse(data.value.layerOutputs)
      : data.value.layerOutputs
    return Array.isArray(outputs) ? outputs : []
  } catch {
    return []
  }
})

const finalDecision = computed(() => {
  if (!data.value?.result) return null
  try {
    return typeof data.value.result === 'string'
      ? JSON.parse(data.value.result)
      : data.value.result
  } catch {
    return null
  }
})
</script>
```

- [ ] **Step 6: Commit**

```bash
git add web/admin/app/pages/research/ web/admin/app/components/research/ web/admin/app/composables/useAnalysis.ts
git commit -m "feat: add research station frontend with SSE streaming and agent cards"
```

---

## Task 15: 前端 — 自选股 AI 信号

**Files:**
- Modify: `web/admin/app/composables/useWatchlist.ts`
- Create: `web/admin/app/components/market/SignalBadge.vue`

- [ ] **Step 1: 创建 AI 信号徽章组件**

```vue
<!-- web/admin/app/components/market/SignalBadge.vue -->
<template>
  <span
    class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
    :class="badgeClass"
  >
    {{ signal }}
  </span>
</template>

<script setup lang="ts">
const props = defineProps<{
  signal: 'BUY' | 'HOLD' | 'SELL' | 'NONE'
}>()

const badgeClass = computed(() => {
  switch (props.signal) {
    case 'BUY': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
    case 'HOLD': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
    case 'SELL': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
    default: return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
  }
})
</script>
```

- [ ] **Step 2: Commit**

```bash
git add web/admin/app/components/market/
git commit -m "feat: add AI signal badge component for watchlist"
```

---

## Task 16: 前端 — 回测页面

**Files:**
- Create: `web/admin/app/composables/useBacktest.ts`
- Create: `web/admin/app/pages/strategy/backtest.vue`
- Create: `web/admin/app/components/backtest/ConfigForm.vue`
- Create: `web/admin/app/components/backtest/ResultPanel.vue`

- [ ] **Step 1: 创建回测 composable**

```typescript
// web/admin/app/composables/useBacktest.ts
export function useBacktest() {
  const config = useRuntimeConfig()
  const baseUrl = config.public.apiBase || ''

  const runBacktest = async (params: {
    strategyCode: string
    ticker: string
    market: string
    startDate: string
    endDate: string
    initialCapital: number
    feeModel: string
  }) => {
    const token = useCookie('token')

    return await $fetch(`${baseUrl}/api/backtest/run`, {
      method: 'POST',
      body: params,
      headers: { Authorization: `Bearer ${token.value}` },
    })
  }

  return { runBacktest }
}
```

- [ ] **Step 2: 创建回测页面**

```vue
<!-- web/admin/app/pages/strategy/backtest.vue -->
<template>
  <div class="p-6 max-w-6xl mx-auto">
    <h1 class="text-2xl font-bold mb-6">策略回测</h1>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- 配置区 -->
      <div>
        <h2 class="text-lg font-semibold mb-3">配置</h2>
        <BacktestConfigForm @submit="handleSubmit" :loading="loading" />
      </div>

      <!-- 结果区 -->
      <div>
        <h2 class="text-lg font-semibold mb-3">结果</h2>
        <BacktestResultPanel v-if="result" :result="result" />
        <div v-else class="text-muted border rounded p-8 text-center">
          提交回测配置后查看结果
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const loading = ref(false)
const result = ref<any>(null)
const { runBacktest } = useBacktest()

const handleSubmit = async (params: any) => {
  loading.value = true
  try {
    result.value = await runBacktest(params)
  } catch (err: any) {
    console.error('Backtest failed:', err)
  } finally {
    loading.value = false
  }
}
</script>
```

- [ ] **Step 3: 创建配置表单组件**

```vue
<!-- web/admin/app/components/backtest/ConfigForm.vue -->
<template>
  <form class="space-y-4" @submit.prevent="submit">
    <div>
      <label class="block text-sm font-medium mb-1">股票代码</label>
      <input v-model="form.ticker" class="w-full border rounded px-3 py-2" placeholder="如 000001" required />
    </div>

    <div class="grid grid-cols-2 gap-4">
      <div>
        <label class="block text-sm font-medium mb-1">开始日期</label>
        <input v-model="form.startDate" type="date" class="w-full border rounded px-3 py-2" required />
      </div>
      <div>
        <label class="block text-sm font-medium mb-1">结束日期</label>
        <input v-model="form.endDate" type="date" class="w-full border rounded px-3 py-2" required />
      </div>
    </div>

    <div class="grid grid-cols-2 gap-4">
      <div>
        <label class="block text-sm font-medium mb-1">市场</label>
        <select v-model="form.market" class="w-full border rounded px-3 py-2">
          <option value="a_stock">A股</option>
          <option value="us_stock">美股</option>
          <option value="crypto">加密</option>
        </select>
      </div>
      <div>
        <label class="block text-sm font-medium mb-1">初始资金</label>
        <input v-model.number="form.initialCapital" type="number" class="w-full border rounded px-3 py-2" />
      </div>
    </div>

    <div>
      <label class="block text-sm font-medium mb-1">策略代码（Python）</label>
      <textarea
        v-model="form.strategyCode"
        class="w-full border rounded px-3 py-2 font-mono text-sm h-48"
        placeholder="from engine.strategies import IndicatorStrategy&#10;import pandas as pd&#10;&#10;class MyStrategy(IndicatorStrategy):&#10;    def generate_signals(self, df):&#10;        signals = pd.Series(0, index=df.index)&#10;        signals[df['close'] > df['close'].rolling(20).mean()] = 1&#10;        signals[df['close'] < df['close'].rolling(20).mean()] = -1&#10;        return signals"
        required
      />
    </div>

    <button
      type="submit"
      class="w-full bg-primary text-white py-2 rounded"
      :disabled="loading"
    >
      {{ loading ? '回测中...' : '开始回测' }}
    </button>
  </form>
</template>

<script setup lang="ts">
const props = defineProps<{ loading: boolean }>()
const emit = defineEmits<{ submit: [payload: any] }>()

const form = reactive({
  ticker: '',
  startDate: '2024-01-01',
  endDate: '2025-01-01',
  market: 'a_stock',
  initialCapital: 1000000,
  feeModel: 'a_stock',
  strategyCode: '',
})

const submit = () => {
  emit('submit', { ...form })
}
</script>
```

- [ ] **Step 4: 创建结果面板组件**

```vue
<!-- web/admin/app/components/backtest/ResultPanel.vue -->
<template>
  <div class="space-y-4">
    <!-- 指标卡片 -->
    <div class="grid grid-cols-3 gap-3">
      <div class="border rounded p-3 text-center">
        <div class="text-sm text-muted">总收益</div>
        <div class="text-lg font-bold" :class="result.metrics.totalReturn >= 0 ? 'text-green-600' : 'text-red-600'">
          {{ (result.metrics.totalReturn * 100).toFixed(2) }}%
        </div>
      </div>
      <div class="border rounded p-3 text-center">
        <div class="text-sm text-muted">Sharpe</div>
        <div class="text-lg font-bold">{{ result.metrics.sharpe.toFixed(2) }}</div>
      </div>
      <div class="border rounded p-3 text-center">
        <div class="text-sm text-muted">最大回撤</div>
        <div class="text-lg font-bold text-red-600">{{ (result.metrics.maxDrawdown * 100).toFixed(2) }}%</div>
      </div>
      <div class="border rounded p-3 text-center">
        <div class="text-sm text-muted">胜率</div>
        <div class="text-lg font-bold">{{ (result.metrics.winRate * 100).toFixed(1) }}%</div>
      </div>
      <div class="border rounded p-3 text-center">
        <div class="text-sm text-muted">盈亏比</div>
        <div class="text-lg font-bold">{{ result.metrics.profitFactor.toFixed(2) }}</div>
      </div>
      <div class="border rounded p-3 text-center">
        <div class="text-sm text-muted">交易次数</div>
        <div class="text-lg font-bold">{{ result.metrics.tradeCount }}</div>
      </div>
    </div>

    <!-- 交易记录 -->
    <div v-if="result.trades?.length">
      <h3 class="font-semibold mb-2">交易记录</h3>
      <div class="max-h-64 overflow-y-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b">
              <th class="text-left py-1">时间</th>
              <th class="text-left py-1">方向</th>
              <th class="text-right py-1">价格</th>
              <th class="text-right py-1">数量</th>
              <th class="text-right py-1">盈亏</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(t, i) in result.trades" :key="i" class="border-b">
              <td class="py-1">{{ t.time }}</td>
              <td class="py-1" :class="t.side === 'buy' ? 'text-green-600' : 'text-red-600'">{{ t.side }}</td>
              <td class="text-right py-1">{{ t.price?.toFixed(2) }}</td>
              <td class="text-right py-1">{{ t.quantity?.toFixed(0) }}</td>
              <td class="text-right py-1" :class="t.pnl > 0 ? 'text-green-600' : t.pnl < 0 ? 'text-red-600' : ''">
                {{ t.pnl ? (t.pnl > 0 ? '+' : '') + t.pnl.toFixed(0) : '-' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{ result: any }>()
</script>
```

- [ ] **Step 5: Commit**

```bash
git add web/admin/app/pages/strategy/ web/admin/app/components/backtest/ web/admin/app/composables/useBacktest.ts
git commit -m "feat: add backtest frontend with config form and result panel"
```

---

## Task 17: 前端导航菜单更新

**Files:**
- Modify: `web/admin/app/constants/menus.ts`

- [ ] **Step 1: 更新导航菜单**

在菜单配置中添加研究站、策略回测入口。

- [ ] **Step 2: Commit**

```bash
git add web/admin/app/constants/menus.ts
git commit -m "feat: add research and strategy to navigation menu"
```

---

## Task 18: 集成测试与验证

- [ ] **Step 1: 构建所有 Docker 镜像**

```bash
cd /Users/xuan/Documents/trading-agent
docker compose build
```

- [ ] **Step 2: 启动所有服务**

```bash
docker compose up -d
docker compose ps
# 预期：8 个服务全部 running
```

- [ ] **Step 3: 验证 LiteLLM**

```bash
curl http://localhost:4000/health
# 预期：返回 LiteLLM 状态
```

- [ ] **Step 4: 验证回测服务**

```bash
curl http://localhost:8002/api/health
# 预期：{"status": "ok"}
```

- [ ] **Step 5: 验证前端登录**

```
浏览器打开 http://localhost:3000
登录 → 进入首页
```

- [ ] **Step 6: 验证研究站**

```
导航到 /research
输入股票代码 → 点击开始分析
观察 SSE 实时输出
```

- [ ] **Step 7: 验证回测**

```
导航到 /strategy/backtest
输入股票代码和策略代码 → 点击回测
查看结果面板
```

- [ ] **Step 8: 最终 Commit**

```bash
git add -A
git commit -m "feat: complete Phase 1 - research station, market hub, backtest engine"
```

---

## Spec 覆盖检查

| P0 功能 | 覆盖 Task |
|---|---|
| 1-7. 7 层 Pipeline | Task 6, 7 |
| 8. SSE 流式输出 | Task 9, 13 |
| 9. Agent 输出配色 | Task 14 (AgentCard.vue) |
| 10. 用户暂停辩论 | Task 7 (Workflow suspend) |
| 11. 分析结果保存 | Task 3, 5 |
| 12-14. 自选股 + AI 信号 | Task 15 |
| 15. 资金流监控 | 后端已有，前端 Task 17 |
| 16-24. 回测引擎 | Task 10, 16 |
| 25-26. 认证 + 用户管理 | 已有 |
