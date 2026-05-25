# QuantMind Phase 1a: 基础骨架 + 可运行流程

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 跑通一个完整流程：打开页面 → 看自选股 → 触发 AI 分析 → 看到结论 → 跑个回测。研究站 7 层 Pipeline 放到 Phase 1b。

**Architecture:** 7 个 Docker 服务（Nuxt/Hono/VoltAgent/LiteLLM/MarketData/Backtest/Scheduler）+ PostgreSQL + Redis + BullMQ。Phase 1a 用单个 Agent 做简单分析，不走完整 Pipeline。

**Tech Stack:** Nuxt 4 + Hono + VoltAgent + FastAPI + LiteLLM + BullMQ + PostgreSQL + Redis

**设计文档:** `docs/superpowers/specs/2026-05-26-quantmind-design.md`

---

## 文件结构总览

### 新增文件

```
infra/litellm/
└── config.yaml                         # LiteLLM 配置

api/business/src/
├── queue/
│   ├── index.ts                        # BullMQ 实例
│   ├── analysis.ts                     # 分析任务类型
│   └── backtest.ts                     # 回测任务类型
├── routes/
│   ├── analysis.ts                     # 分析 API（入队/查询/SSE/历史）
│   └── backtest-proxy.ts              # 回测代理
└── db/schema.ts                        # 扩展表

services/agent/
├── package.json
├── tsconfig.json
├── Dockerfile
└── src/
    ├── index.ts                        # VoltAgent 入口（单 Agent 快速分析）
    ├── tools/
    │   └── market-data.ts              # Market Data HTTP Tools
    ├── prompts/
    │   └── index.ts                    # Prompt 模板
    └── worker.ts                       # BullMQ Worker 消费分析队列

services/backtest/
├── requirements.txt
├── Dockerfile
└── app/
    ├── __init__.py
    ├── main.py                         # FastAPI 入口
    ├── engine/
    │   ├── __init__.py
    │   ├── core.py                     # 回测引擎
    │   ├── strategies.py              # 策略接口
    │   └── fees.py                     # 费用模型
    └── routes/
        ├── __init__.py
        └── backtest.py                # 回测 API

web/admin/
├── server/api/[...].ts                 # 扩展 proxy 支持 VoltAgent/Backtest
└── app/
    ├── composables/
    │   ├── useAnalysis.ts             # 分析 hooks
    │   ├── useSSE.ts                  # SSE 流式消费
    │   └── useBacktest.ts            # 回测 hooks
    ├── components/
    │   ├── research/
    │   │   └── AnalysisCard.vue       # 分析结果卡片
    │   ├── market/
    │   │   └── SignalBadge.vue        # AI 信号徽章
    │   └── backtest/
    │       ├── ConfigForm.vue         # 回测配置表单
    │       └── ResultPanel.vue        # 回测结果面板
    └── pages/
        ├── research/
        │   └── index.vue              # 分析入口页
        └── strategy/
            └── backtest.vue           # 回测页
```

### 修改文件

```
api/business/src/index.ts               # 注册新路由
api/business/src/db/schema.ts           # 新增表
api/business/package.json               # 新增 bullmq
services/market-data/app/api/routes.py  # 新增批量行情接口
docker-compose.yml                      # 新增 voltagent/backtest/litellm
web/admin/nuxt.config.ts               # 新增代理配置
web/admin/app/constants/menus.ts       # 导航菜单
pnpm-workspace.yaml                    # 确认包含 services/*
```

---

## Task 1: LiteLLM 配置

**Files:**
- Create: `infra/litellm/config.yaml`
- Modify: `docker-compose.yml`

- [ ] **Step 1: 创建 LiteLLM 配置**

```yaml
# infra/litellm/config.yaml
model_list:
  - model_name: "default"
    litellm_params:
      model: "deepseek/deepseek-chat"
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

- [ ] **Step 2: docker-compose.yml 添加 litellm 服务**

在 `# Backend Services` 区域、`api:` 之前添加：

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

- [ ] **Step 3: Commit**

```bash
git add infra/litellm/config.yaml docker-compose.yml
git commit -m "feat: add LiteLLM proxy config and docker service"
```

---

## Task 2: BullMQ 基础设施 + DB Schema 扩展

**Files:**
- Create: `api/business/src/queue/index.ts`
- Create: `api/business/src/queue/analysis.ts`
- Create: `api/business/src/queue/backtest.ts`
- Modify: `api/business/package.json`
- Modify: `api/business/src/db/schema.ts`

- [ ] **Step 1: 安装 BullMQ**

```bash
cd /Users/xuan/Documents/trading-agent && pnpm --filter @trading-agent/api add bullmq
```

- [ ] **Step 2: 创建 BullMQ 连接和队列**

```typescript
// api/business/src/queue/index.ts
import { Queue } from 'bullmq'
import Redis from 'ioredis'

export const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
})

export const analysisQueue = new Queue('analysis', { connection })
export const backtestQueue = new Queue('backtest', { connection })
```

- [ ] **Step 3: 创建任务类型定义**

```typescript
// api/business/src/queue/analysis.ts
export interface AnalysisJobData {
  runId: string
  userId: number
  ticker: string
  market: 'a_stock' | 'hk' | 'us' | 'crypto'
  depth: 'quick' | 'standard' | 'deep'
}
```

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
```

- [ ] **Step 4: 扩展数据库 Schema**

在 `api/business/src/db/schema.ts` 末尾追加：

```typescript
export const analysisRuns = pgTable('analysis_runs', {
  id: serial('id').primaryKey(),
  userId: serial('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  ticker: varchar('ticker', { length: 20 }).notNull(),
  market: varchar('market', { length: 10 }).notNull(),
  depth: varchar('depth', { length: 20 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  result: text('result'),
  layerOutputs: text('layer_outputs'),
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
  config: text('config').notNull(),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  metrics: text('metrics'),
  equityCurve: text('equity_curve'),
  trades: text('trades'),
  error: text('error'),
  createdAt: timestamp('created_at').defaultNow(),
  completedAt: timestamp('completed_at'),
})

export type AnalysisRun = typeof analysisRuns.$inferSelect
export type BacktestRun = typeof backtestRuns.$inferSelect
```

- [ ] **Step 5: 推送 Schema**

```bash
pnpm --filter @trading-agent/api db:push
```

- [ ] **Step 6: Commit**

```bash
git add api/business/src/queue/ api/business/src/db/schema.ts api/business/package.json pnpm-lock.yaml
git commit -m "feat: add BullMQ queues, job types, and analysis/backtest DB tables"
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

  const [run] = await db.insert(analysisRuns).values({
    userId: user.id,
    ticker: body.ticker,
    market: body.market || 'a_stock',
    depth: body.depth || 'quick',
    status: 'pending',
  }).returning()

  const jobData: AnalysisJobData = {
    runId: String(run.id),
    userId: user.id,
    ticker: body.ticker,
    market: body.market || 'a_stock',
    depth: body.depth || 'quick',
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

  const rows = await db.select().from(analysisRuns)
    .where(eq(analysisRuns.id, id))
    .limit(1)

  if (!rows.length || rows[0].userId !== user.id) {
    return c.json({ error: 'Not found' }, 404)
  }

  const run = rows[0]
  return c.json({
    ...run,
    result: run.result ? JSON.parse(run.result) : null,
    layerOutputs: run.layerOutputs ? JSON.parse(run.layerOutputs) : null,
  })
})

// 分析完成回调（VoltAgent Worker 调用）
analysis.post('/:id/complete', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json()

  await db.update(analysisRuns)
    .set({
      status: 'completed',
      result: JSON.stringify(body.result),
      layerOutputs: JSON.stringify(body.layerOutputs || {}),
      completedAt: new Date(),
    })
    .where(eq(analysisRuns.id, id))

  return c.json({ success: true })
})

// 分析失败回调
analysis.post('/:id/fail', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json()

  await db.update(analysisRuns)
    .set({
      status: 'failed',
      result: JSON.stringify({ error: body.error }),
      completedAt: new Date(),
    })
    .where(eq(analysisRuns.id, id))

  return c.json({ success: true })
})

// SSE 流式端点
analysis.get('/:id/stream', async (c) => {
  const id = c.req.param('id')

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      let done = false

      const poll = async () => {
        if (done) return

        const rows = await db.select().from(analysisRuns)
          .where(eq(analysisRuns.id, Number(id)))
          .limit(1)

        if (rows.length) {
          const run = rows[0]
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            status: run.status,
            result: run.result ? JSON.parse(run.result) : null,
            layerOutputs: run.layerOutputs ? JSON.parse(run.layerOutputs) : null,
          })}\n\n`))

          if (run.status === 'completed' || run.status === 'failed') {
            done = true
            controller.close()
            return
          }
        }

        if (!done) {
          setTimeout(poll, 2000)
        }
      }

      poll()
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

// 分析历史
analysis.get('/', async (c) => {
  const user = c.get('user') as { id: number }

  const runs = await db.select().from(analysisRuns)
    .where(eq(analysisRuns.userId, user.id))
    .orderBy(desc(analysisRuns.createdAt))
    .limit(50)

  return c.json(runs.map(run => ({
    ...run,
    result: run.result ? JSON.parse(run.result) : null,
    layerOutputs: run.layerOutputs ? JSON.parse(run.layerOutputs) : null,
  })))
})

export { analysis }
```

- [ ] **Step 2: 注册路由**

在 `api/business/src/index.ts` 添加：

```typescript
import { analysis as analysisRoutes } from './routes/analysis'

// 在 app.route('/api/watchlist', watchlistRoutes) 下方添加：
app.route('/api/analysis', analysisRoutes)
```

- [ ] **Step 3: Commit**

```bash
git add api/business/src/routes/analysis.ts api/business/src/index.ts
git commit -m "feat: add analysis API routes with SSE streaming and BullMQ enqueue"
```

---

## Task 4: VoltAgent 服务（单 Agent 快速分析）

**Files:**
- Create: `services/agent/package.json`
- Create: `services/agent/tsconfig.json`
- Create: `services/agent/src/index.ts`
- Create: `services/agent/src/tools/market-data.ts`
- Create: `services/agent/src/prompts/index.ts`
- Create: `services/agent/src/worker.ts`
- Create: `services/agent/Dockerfile`

- [ ] **Step 1: 确认 pnpm-workspace.yaml 包含 services***

检查 `pnpm-workspace.yaml`，确保有：

```yaml
packages:
  - 'api/*'
  - 'web/*'
  - 'services/*'
  - 'shared/*'
```

- [ ] **Step 2: 创建 package.json**

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
    "bullmq": "^5.0.0",
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

- [ ] **Step 3: 创建 tsconfig.json**

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

- [ ] **Step 4: 创建 Market Data Tools**

```typescript
// services/agent/src/tools/market-data.ts
import { createTool } from '@voltagent/core'
import { z } from 'zod'

const MARKET_DATA_BASE = process.env.MARKET_DATA_URL || 'http://market-data:8000'

async function fetchData(path: string) {
  const res = await fetch(`${MARKET_DATA_BASE}${path}`)
  if (!res.ok) throw new Error(`Market data error: ${res.status}`)
  return res.json()
}

export const getQuoteTool = createTool({
  name: 'get_quote',
  description: '获取股票实时行情',
  parameters: z.object({
    symbol: z.string().describe('股票代码'),
  }),
  execute: async ({ symbol }) => fetchData(`/api/quote?symbol=${encodeURIComponent(symbol)}`),
})

export const getKlineTool = createTool({
  name: 'get_kline',
  description: '获取K线数据',
  parameters: z.object({
    symbol: z.string().describe('股票代码'),
    interval: z.string().default('1d'),
    limit: z.number().default(100),
  }),
  execute: async ({ symbol, interval, limit }) =>
    fetchData(`/api/kline?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=${limit}`),
})

export const getIndicatorsTool = createTool({
  name: 'get_indicators',
  description: '获取技术指标',
  parameters: z.object({
    symbol: z.string().describe('股票代码'),
    indicators: z.string().describe('逗号分隔指标名'),
    interval: z.string().default('1d'),
    period: z.number().default(100),
  }),
  execute: async ({ symbol, indicators, interval, period }) =>
    fetchData(`/api/indicators?symbol=${encodeURIComponent(symbol)}&indicators=${indicators}&interval=${interval}&period=${period}`),
})
```

- [ ] **Step 5: 创建 Prompt 模板**

```typescript
// services/agent/src/prompts/index.ts
export const QUICK_ANALYSIS_PROMPT = `你是 QuantMind 投研分析师。根据获取到的行情数据和技术指标，给出简洁的投研分析。

要求：
1. 先获取实时行情（get_quote）
2. 再获取K线数据（get_kline，最近60天）
3. 再获取技术指标（get_indicators：rsi,macd,ema）
4. 综合以上数据给出分析

输出 JSON 格式：
{
  "summary": "一句话概括",
  "trend": "上涨/下跌/盘整",
  "signal": "BUY/HOLD/SELL",
  "confidence": 0-100,
  "technical": {
    "rsi": 数值,
    "macd": "金叉/死叉/无信号",
    "ema": "价格在EMA上方/下方"
  },
  "reasons": ["理由1", "理由2", "理由3"],
  "risks": ["风险1", "风险2"],
  "suggestion": "操作建议"
}`
```

- [ ] **Step 6: 创建 VoltAgent 入口（单 Agent 快速分析）**

```typescript
// services/agent/src/index.ts
import { Agent, VoltAgent } from '@voltagent/core'
import { createPinoLogger } from '@voltagent/logger'
import { honoServer } from '@voltagent/server-hono'
import { getQuoteTool, getKlineTool, getIndicatorsTool } from './tools/market-data'
import { QUICK_ANALYSIS_PROMPT } from './prompts'
import { startAnalysisWorker } from './worker'

const logger = createPinoLogger({
  name: 'trading-agent',
  level: 'info',
})

const quickAnalysisAgent = new Agent({
  name: 'QuickAnalysis',
  purpose: '快速投研分析',
  instructions: QUICK_ANALYSIS_PROMPT,
  model: 'openai/deepseek-chat',
  tools: [getQuoteTool, getKlineTool, getIndicatorsTool],
})

new VoltAgent({
  agents: { quickAnalysisAgent },
  logger,
  server: honoServer({
    port: 4001,
    basePath: '/agent',
  }),
})

// 启动 BullMQ Worker
if (process.env.START_WORKER !== 'false') {
  startAnalysisWorker()
  console.log('Analysis worker started')
}
```

- [ ] **Step 7: 创建 BullMQ Worker**

```typescript
// services/agent/src/worker.ts
import { Worker } from 'bullmq'
import type { AnalysisJobData } from '../../api/business/src/queue/analysis'
import { connection } from './worker-connection'

const BACKEND_URL = process.env.BACKEND_URL || 'http://api:4000'

export function startAnalysisWorker() {
  const worker = new Worker<AnalysisJobData>(
    'analysis',
    async (job) => {
      const { runId, ticker, market, depth } = job.data
      console.log(`Processing analysis ${runId}: ${ticker}`)

      try {
        // 调用 VoltAgent Agent API
        const res = await fetch('http://localhost:4001/agent/agents/quickAnalysisAgent/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [{ role: 'user', content: `分析 ${ticker}（市场：${market}），深度：${depth}` }],
          }),
        })

        if (!res.ok) {
          const errText = await res.text()
          throw new Error(`Agent call failed: ${res.status} ${errText}`)
        }

        const agentResult = await res.json()

        // 提取 JSON 结果（Agent 返回的文本中可能包含 JSON）
        let analysisResult: Record<string, unknown>
        try {
          const text = agentResult.text || agentResult.content || JSON.stringify(agentResult)
          // 尝试从文本中提取 JSON
          const jsonMatch = text.match(/\{[\s\S]*\}/)
          analysisResult = jsonMatch ? JSON.parse(jsonMatch[0]) : { rawAnalysis: text }
        } catch {
          analysisResult = { rawAnalysis: JSON.stringify(agentResult) }
        }

        // 回写结果
        await fetch(`${BACKEND_URL}/api/analysis/${runId}/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ result: analysisResult }),
        })

        return { runId, status: 'completed' }
      } catch (err: any) {
        // 回写失败
        await fetch(`${BACKEND_URL}/api/analysis/${runId}/fail`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: err.message }),
        }).catch(() => {})

        throw err
      }
    },
    { connection, concurrency: 3 },
  )

  worker.on('completed', (job) => console.log(`Analysis ${job.data.runId} completed`))
  worker.on('failed', (job, err) => console.error(`Analysis ${job?.data.runId} failed:`, err.message))

  return worker
}
```

- [ ] **Step 8: 创建 Worker 连接**

```typescript
// services/agent/src/worker-connection.ts
import Redis from 'ioredis'

export const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
})
```

- [ ] **Step 9: 创建 Dockerfile**

```dockerfile
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable pnpm
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY services/agent/package.json ./services/agent/package.json
COPY api/business/package.json ./api/business/package.json
RUN pnpm install --filter=@trading-agent/agent --filter=@trading-agent/api --frozen-lockfile
COPY services/agent ./services/agent
COPY api/business/src/queue ./api/business/src/queue
RUN pnpm --filter=@trading-agent/agent exec tsc

FROM node:22-alpine
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY services/agent/package.json ./services/agent/package.json
COPY api/business/package.json ./api/business/package.json
RUN corepack enable pnpm && \
    pnpm install --filter=@trading-agent/agent --filter=@trading-agent/api --prod --frozen-lockfile && \
    rm -rf /root/.local/share/pnpm /root/.cache
COPY --from=build /app/services/agent/dist ./services/agent/dist
COPY api/business/src/queue ./api/business/src/queue
EXPOSE 4001
CMD ["node", "services/agent/dist/index.js"]
```

- [ ] **Step 10: 安装依赖并验证编译**

```bash
cd /Users/xuan/Documents/trading-agent && pnpm install
```

- [ ] **Step 11: Commit**

```bash
git add services/agent/ pnpm-lock.yaml pnpm-workspace.yaml
git commit -m "feat: scaffold VoltAgent service with single quick-analysis agent and BullMQ worker"
```

---

## Task 5: 回测服务

**Files:**
- Create: `services/backtest/requirements.txt`
- Create: `services/backtest/Dockerfile`
- Create: `services/backtest/app/__init__.py`
- Create: `services/backtest/app/main.py`
- Create: `services/backtest/app/engine/__init__.py`
- Create: `services/backtest/app/engine/core.py`
- Create: `services/backtest/app/engine/strategies.py`
- Create: `services/backtest/app/engine/fees.py`
- Create: `services/backtest/app/routes/__init__.py`
- Create: `services/backtest/app/routes/backtest.py`

- [ ] **Step 1: 创建 requirements.txt**

```
fastapi==0.115.0
uvicorn==0.30.0
pandas==2.2.0
numpy==1.26.0
TA-Lib==0.4.28
httpx==0.27.0
pydantic==2.9.0
```

- [ ] **Step 2: 创建策略接口**

```python
# services/backtest/app/engine/strategies.py
from abc import ABC, abstractmethod
import pandas as pd


class IndicatorStrategy(ABC):
    """基于 DataFrame 的信号策略"""

    @abstractmethod
    def generate_signals(self, df: pd.DataFrame) -> pd.Series:
        """
        输入：OHLCV DataFrame
        输出：信号 Series（1=买入, -1=卖出, 0=持有）
        """
        pass
```

- [ ] **Step 3: 创建费用模型**

```python
# services/backtest/app/engine/fees.py
from dataclasses import dataclass


@dataclass
class FeeModel:
    commission_rate: float = 0.0003
    min_commission: float = 5.0
    stamp_tax_rate: float = 0.0
    slippage_rate: float = 0.001


FEE_MODELS = {
    "a_stock": FeeModel(commission_rate=0.0003, min_commission=5.0, stamp_tax_rate=0.001, slippage_rate=0.001),
    "us_stock": FeeModel(commission_rate=0.0, min_commission=0.0, stamp_tax_rate=0.0, slippage_rate=0.001),
    "crypto": FeeModel(commission_rate=0.001, min_commission=0.0, stamp_tax_rate=0.0, slippage_rate=0.002),
}


def calculate_fee(price: float, quantity: float, side: str, model: FeeModel) -> float:
    value = price * quantity
    commission = max(value * model.commission_rate, model.min_commission)
    stamp_tax = value * model.stamp_tax_rate if side == "sell" else 0.0
    slippage = value * model.slippage_rate
    return commission + stamp_tax + slippage
```

- [ ] **Step 4: 创建回测引擎核心**

```python
# services/backtest/app/engine/core.py
import pandas as pd
import numpy as np
from typing import Optional
from .strategies import IndicatorStrategy
from .fees import FEE_MODELS, calculate_fee


class BacktestEngine:
    def __init__(self, strategy: IndicatorStrategy, df: pd.DataFrame,
                 initial_capital: float = 1000000.0, fee_model_name: str = "a_stock"):
        self.strategy = strategy
        self.df = df
        self.initial_capital = initial_capital
        self.fee_model = FEE_MODELS.get(fee_model_name, FEE_MODELS["a_stock"])

    def run(self) -> dict:
        signals = self.strategy.generate_signals(self.df)

        cash = self.initial_capital
        position = 0.0
        entry_price = 0.0
        trades = []
        equity_curve = []

        for i in range(len(self.df)):
            row = self.df.iloc[i]
            signal = int(signals.iloc[i]) if i < len(signals) else 0
            price = float(row["close"])

            if signal == 1 and position == 0 and cash > 0:
                quantity = cash / price
                fee = calculate_fee(price, quantity, "buy", self.fee_model)
                position = quantity
                cash = -fee
                trades.append({"time": str(row.name), "side": "buy", "price": price, "quantity": quantity, "fee": fee})

            elif signal == -1 and position > 0:
                fee = calculate_fee(price, position, "sell", self.fee_model)
                proceeds = position * price - fee
                pnl = proceeds - (position * entry_price)
                cash = proceeds
                trades.append({"time": str(row.name), "side": "sell", "price": price, "quantity": position, "fee": fee, "pnl": pnl})
                position = 0.0

            equity_curve.append(cash + position * price)

        metrics = self._calc_metrics(equity_curve, trades)
        return {"metrics": metrics, "equity_curve": equity_curve, "trades": trades}

    def _calc_metrics(self, equity_curve: list, trades: list) -> dict:
        if len(equity_curve) < 2:
            return {"totalReturn": 0, "sharpe": 0, "maxDrawdown": 0, "winRate": 0, "profitFactor": 0, "tradeCount": 0}

        eq = pd.Series(equity_curve)
        returns = eq.pct_change().dropna()
        total_return = (eq.iloc[-1] / self.initial_capital) - 1
        sharpe = float((returns.mean() / returns.std()) * np.sqrt(252)) if returns.std() > 0 else 0.0

        peak = eq.cummax()
        drawdown = (eq - peak) / peak
        max_drawdown = float(drawdown.min())

        closed = [t for t in trades if "pnl" in t]
        wins = [t for t in closed if t["pnl"] > 0]
        win_rate = len(wins) / len(closed) if closed else 0.0

        total_profit = sum(t["pnl"] for t in closed if t["pnl"] > 0)
        total_loss = abs(sum(t["pnl"] for t in closed if t["pnl"] < 0))
        profit_factor = total_profit / total_loss if total_loss > 0 else float("inf")

        return {
            "totalReturn": round(total_return, 4),
            "sharpe": round(sharpe, 4),
            "maxDrawdown": round(max_drawdown, 4),
            "winRate": round(win_rate, 4),
            "profitFactor": round(profit_factor, 4),
            "tradeCount": len(closed),
        }
```

- [ ] **Step 5: 创建 API 路由**

```python
# services/backtest/app/routes/backtest.py
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import pandas as pd
import httpx
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from engine.core import BacktestEngine
from engine.strategies import IndicatorStrategy

router = APIRouter(prefix="/api")
MARKET_DATA_URL = os.environ.get("MARKET_DATA_URL", "http://market-data:8000")


class BacktestRequest(BaseModel):
    strategy_code: str
    ticker: str
    start_date: str
    end_date: str
    initial_capital: float = 1000000.0
    fee_model: str = "a_stock"


@router.post("/run")
async def run_backtest(req: BacktestRequest):
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(f"{MARKET_DATA_URL}/api/kline",
                                    params={"symbol": req.ticker, "interval": "1d", "limit": 500})
            resp.raise_for_status()
            kline_data = resp.json()

        if not kline_data.get("data"):
            raise HTTPException(status_code=404, detail="No kline data")

        df = pd.DataFrame(kline_data["data"])
        df["time"] = pd.to_datetime(df["time"])
        df = df.set_index("time")
        for col in ["open", "high", "low", "close", "volume"]:
            df[col] = pd.to_numeric(df[col], errors="coerce")

        df = df[req.start_date:req.end_date]
        if len(df) < 10:
            raise HTTPException(status_code=400, detail="Insufficient data")

        local_ns = {"pd": pd, "np": __import__("numpy"), "IndicatorStrategy": IndicatorStrategy}
        exec(req.strategy_code, local_ns)

        strategy_class = None
        for v in local_ns.values():
            if isinstance(v, type) and issubclass(v, IndicatorStrategy) and v is not IndicatorStrategy:
                strategy_class = v
                break

        if not strategy_class:
            raise HTTPException(status_code=400, detail="No IndicatorStrategy subclass found")

        engine = BacktestEngine(strategy_class(), df, req.initial_capital, req.fee_model)
        result = engine.run()
        return {"status": "completed", **result}

    except HTTPException:
        raise
    except Exception as e:
        return {"status": "failed", "error": str(e)}


@router.get("/health")
async def health():
    return {"status": "ok"}
```

- [ ] **Step 6: 创建 FastAPI 入口**

```python
# services/backtest/app/main.py
from fastapi import FastAPI
from .routes.backtest import router

app = FastAPI(title="QuantMind Backtest", version="1.0.0")
app.include_router(router)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8002)
```

- [ ] **Step 7: 创建 Dockerfile**

```dockerfile
FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential wget && \
    wget -q http://prdownloads.sourceforge.net/ta-lib/ta-lib-0.4.0-src.tar.gz && \
    tar -xzf ta-lib-0.4.0-src.tar.gz && \
    cd ta-lib-0.4.0 && ./configure --quiet && make -s && make install && \
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
git commit -m "feat: add backtest service with engine, fee models, and API"
```

---

## Task 6: Docker Compose 集成

**Files:**
- Modify: `docker-compose.yml`

- [ ] **Step 1: 添加 voltagent / backtest / litellm 服务**

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
      - OPENAI_API_KEY=${DEEPSEEK_API_KEY:-sk-placeholder}
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
      - MARKET_DATA_URL=http://market-data:8000
    depends_on:
      - market-data
    restart: unless-stopped
    networks:
      - trading-net
```

同时在 `api` 服务的 environment 添加：

```yaml
      - VOLTAGENT_URL=http://voltagent:4001
      - BACKTEST_URL=http://backtest:8002
```

- [ ] **Step 2: 构建验证**

```bash
docker compose build
```

- [ ] **Step 3: Commit**

```bash
git add docker-compose.yml
git commit -m "feat: add voltagent, backtest, litellm to docker compose"
```

---

## Task 7: Nuxt Proxy 扩展

**Files:**
- Modify: `web/admin/server/api/[...].ts`
- Modify: `web/admin/nuxt.config.ts`

- [ ] **Step 1: 扩展 proxy 支持多后端**

替换 `web/admin/server/api/[...].ts`：

```typescript
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const path = event.path

  // 按路径前缀路由到不同后端
  let target: string
  let targetPath = path

  if (path.startsWith('/api/agent')) {
    target = config.agentInternal || 'http://voltagent:4001'
    targetPath = path.replace('/api/agent', '/agent')
  } else if (path.startsWith('/api/backtest')) {
    target = config.backtestInternal || 'http://backtest:8002'
  } else {
    target = config.apiBaseInternal || 'http://api:4000'
  }

  try {
    const body = ['POST', 'PUT', 'PATCH'].includes(event.method)
      ? await readRawBody(event)
      : undefined

    const response = await fetch(target + targetPath, {
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

- [ ] **Step 2: 更新 nuxt.config.ts runtimeConfig**

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
git commit -m "feat: extend Nuxt proxy to route to VoltAgent and Backtest services"
```

---

## Task 8: 前端 — Composables

**Files:**
- Create: `web/admin/app/composables/useSSE.ts`
- Create: `web/admin/app/composables/useAnalysis.ts`
- Create: `web/admin/app/composables/useBacktest.ts`

- [ ] **Step 1: 创建 SSE composable**

```typescript
// web/admin/app/composables/useSSE.ts
export function useAnalysisStream(runId: Ref<string | number>) {
  const status = ref<'connecting' | 'streaming' | 'completed' | 'failed'>('connecting')
  const data = ref<Record<string, any> | null>(null)
  const error = ref<string | null>(null)

  const config = useRuntimeConfig()
  const baseUrl = config.public.apiBase || ''

  let timer: ReturnType<typeof setInterval> | null = null

  const connect = () => {
    status.value = 'connecting'
    const token = useCookie('token')

    // 用轮询代替 SSE（兼容性更好）
    timer = setInterval(async () => {
      try {
        const res = await $fetch<{ status: string; result: any; layerOutputs: any }>(
          `${baseUrl}/api/analysis/${runId.value}`,
          { headers: { Authorization: `Bearer ${token.value}` } },
        )

        data.value = res
        status.value = 'streaming'

        if (res.status === 'completed' || res.status === 'failed') {
          status.value = res.status as any
          if (timer) clearInterval(timer)
        }
      } catch (err: any) {
        error.value = err.message
        status.value = 'failed'
        if (timer) clearInterval(timer)
      }
    }, 2000)
  }

  const disconnect = () => {
    if (timer) clearInterval(timer)
    timer = null
  }

  onMounted(connect)
  onUnmounted(disconnect)

  watch(runId, () => {
    disconnect()
    connect()
  })

  return { status, data, error, connect, disconnect }
}
```

- [ ] **Step 2: 创建分析 composable**

```typescript
// web/admin/app/composables/useAnalysis.ts
export function useAnalysis() {
  const config = useRuntimeConfig()
  const baseUrl = config.public.apiBase || ''

  const triggerAnalysis = async (ticker: string, market = 'a_stock', depth = 'quick') => {
    const token = useCookie('token')
    return await $fetch<{ runId: number; status: string }>(`${baseUrl}/api/analysis/start`, {
      method: 'POST',
      body: { ticker, market, depth },
      headers: { Authorization: `Bearer ${token.value}` },
    })
  }

  const getAnalysisHistory = async () => {
    const token = useCookie('token')
    return await $fetch(`${baseUrl}/api/analysis`, {
      headers: { Authorization: `Bearer ${token.value}` },
    })
  }

  return { triggerAnalysis, getAnalysisHistory }
}
```

- [ ] **Step 3: 创建回测 composable**

```typescript
// web/admin/app/composables/useBacktest.ts
export function useBacktest() {
  const config = useRuntimeConfig()
  const baseUrl = config.public.apiBase || ''

  const runBacktest = async (params: {
    strategyCode: string
    ticker: string
    startDate: string
    endDate: string
    initialCapital: number
    feeModel: string
  }) => {
    return await $fetch(`${baseUrl}/api/backtest/run`, {
      method: 'POST',
      body: params,
    })
  }

  return { runBacktest }
}
```

- [ ] **Step 4: Commit**

```bash
git add web/admin/app/composables/useSSE.ts web/admin/app/composables/useAnalysis.ts web/admin/app/composables/useBacktest.ts
git commit -m "feat: add SSE, analysis, and backtest composables"
```

---

## Task 9: 前端 — AI 信号徽章 + 分析结果卡片

**Files:**
- Create: `web/admin/app/components/market/SignalBadge.vue`
- Create: `web/admin/app/components/research/AnalysisCard.vue`

- [ ] **Step 1: 创建信号徽章**

```vue
<!-- web/admin/app/components/market/SignalBadge.vue -->
<template>
  <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium" :class="badgeClass">
    {{ signal }}
  </span>
</template>

<script setup lang="ts">
const props = defineProps<{ signal: 'BUY' | 'HOLD' | 'SELL' | 'NONE' }>()

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

- [ ] **Step 2: 创建分析结果卡片**

```vue
<!-- web/admin/app/components/research/AnalysisCard.vue -->
<template>
  <div class="border rounded-lg p-5">
    <div class="flex items-center justify-between mb-3">
      <h3 class="font-semibold text-lg">{{ result.ticker || ticker }}</h3>
      <MarketSignalBadge :signal="result.signal || 'NONE'" />
    </div>

    <p v-if="result.summary" class="text-sm text-muted mb-3">{{ result.summary }}</p>

    <div v-if="result.confidence" class="mb-3">
      <div class="text-sm text-muted mb-1">置信度 {{ result.confidence }}%</div>
      <div class="w-full bg-muted rounded-full h-2">
        <div class="h-2 rounded-full" :class="barColor" :style="{ width: result.confidence + '%' }" />
      </div>
    </div>

    <div v-if="result.reasons?.length" class="mb-3">
      <div class="text-sm font-medium mb-1">核心理由</div>
      <ul class="text-sm list-disc list-inside text-muted">
        <li v-for="r in result.reasons" :key="r">{{ r }}</li>
      </ul>
    </div>

    <div v-if="result.risks?.length">
      <div class="text-sm font-medium mb-1">风险提示</div>
      <ul class="text-sm list-disc list-inside text-red-600 dark:text-red-400">
        <li v-for="r in result.risks" :key="r">{{ r }}</li>
      </ul>
    </div>

    <div v-if="result.suggestion" class="mt-3 p-3 bg-muted rounded text-sm">
      {{ result.suggestion }}
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  ticker: string
  result: Record<string, any>
}>()

const barColor = computed(() => {
  if (props.result.signal === 'BUY') return 'bg-green-500'
  if (props.result.signal === 'SELL') return 'bg-red-500'
  return 'bg-yellow-500'
})
</script>
```

- [ ] **Step 3: Commit**

```bash
git add web/admin/app/components/market/SignalBadge.vue web/admin/app/components/research/AnalysisCard.vue
git commit -m "feat: add AI signal badge and analysis result card components"
```

---

## Task 10: 前端 — 研究站页面

**Files:**
- Create: `web/admin/app/pages/research/index.vue`

- [ ] **Step 1: 创建研究站页面**

```vue
<!-- web/admin/app/pages/research/index.vue -->
<template>
  <div class="p-6 max-w-4xl mx-auto">
    <h1 class="text-2xl font-bold mb-6">AI 投研分析</h1>

    <!-- 分析输入 -->
    <div class="flex gap-3 mb-8">
      <input
        v-model="ticker"
        placeholder="输入代码，如 000001, AAPL, 0700.HK"
        class="flex-1 border rounded px-4 py-2"
        @keyup.enter="startAnalysis"
      />
      <select v-model="market" class="border rounded px-3 py-2">
        <option value="a_stock">A股</option>
        <option value="hk">港股</option>
        <option value="us">美股</option>
        <option value="crypto">加密</option>
      </select>
      <button
        class="bg-primary text-white px-6 py-2 rounded hover:opacity-90"
        :disabled="loading"
        @click="startAnalysis"
      >
        {{ loading ? '分析中...' : '快速分析' }}
      </button>
    </div>

    <!-- 当前分析结果 -->
    <div v-if="currentRunId" class="mb-8">
      <div v-if="streamStatus === 'connecting'" class="text-center py-12">
        <div class="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-3" />
        <p class="text-muted">正在分析 {{ currentTicker }}...</p>
      </div>

      <div v-else-if="streamStatus === 'streaming' && streamData?.result">
        <ResearchAnalysisCard :ticker="currentTicker" :result="streamData.result" />
      </div>

      <div v-else-if="streamStatus === 'completed' && streamData?.result">
        <ResearchAnalysisCard :ticker="currentTicker" :result="streamData.result" />
      </div>

      <div v-else-if="streamStatus === 'failed'" class="text-center py-8 text-red-500">
        分析失败，请重试
      </div>
    </div>

    <!-- 历史记录 -->
    <h2 class="text-lg font-semibold mb-4">分析历史</h2>
    <div v-if="history.length" class="space-y-2">
      <div
        v-for="run in history"
        :key="run.id"
        class="border rounded p-3 hover:bg-muted cursor-pointer"
        @click="viewResult(run)"
      >
        <div class="flex items-center justify-between">
          <div>
            <span class="font-medium">{{ run.ticker }}</span>
            <span class="text-sm text-muted ml-2">{{ run.market }} · {{ run.depth }}</span>
          </div>
          <div class="flex items-center gap-2">
            <MarketSignalBadge v-if="parseResult(run.result)?.signal" :signal="parseResult(run.result).signal" />
            <span class="text-xs text-muted">{{ formatDate(run.createdAt) }}</span>
          </div>
        </div>
      </div>
    </div>
    <div v-else class="text-muted">暂无分析记录</div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const ticker = ref('')
const market = ref('a_stock')
const loading = ref(false)
const currentRunId = ref('')
const currentTicker = ref('')
const history = ref<any[]>([])

const { triggerAnalysis, getAnalysisHistory } = useAnalysis()

const runIdRef = computed(() => currentRunId.value)
const { status: streamStatus, data: streamData } = useAnalysisStream(runIdRef)

const startAnalysis = async () => {
  if (!ticker.value) return
  loading.value = true
  try {
    const res = await triggerAnalysis(ticker.value, market.value, 'quick')
    currentRunId.value = String(res.runId)
    currentTicker.value = ticker.value
  } finally {
    loading.value = false
  }
}

const viewResult = (run: any) => {
  currentRunId.value = String(run.id)
  currentTicker.value = run.ticker
}

const parseResult = (result: any) => {
  if (!result) return {}
  return typeof result === 'string' ? JSON.parse(result) : result
}

const formatDate = (d: string) => {
  if (!d) return ''
  return new Date(d).toLocaleDateString('zh-CN')
}

onMounted(async () => {
  try {
    const data = await getAnalysisHistory()
    history.value = data as any[]
  } catch {}
})
</script>
```

- [ ] **Step 2: Commit**

```bash
git add web/admin/app/pages/research/
git commit -m "feat: add research analysis page with quick analysis trigger and history"
```

---

## Task 11: 前端 — 回测页面

**Files:**
- Create: `web/admin/app/pages/strategy/backtest.vue`
- Create: `web/admin/app/components/backtest/ConfigForm.vue`
- Create: `web/admin/app/components/backtest/ResultPanel.vue`

- [ ] **Step 1: 创建回测页面**

```vue
<!-- web/admin/app/pages/strategy/backtest.vue -->
<template>
  <div class="p-6 max-w-6xl mx-auto">
    <h1 class="text-2xl font-bold mb-6">策略回测</h1>
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div>
        <h2 class="text-lg font-semibold mb-3">配置</h2>
        <BacktestConfigForm @submit="handleSubmit" :loading="loading" />
      </div>
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
  result.value = null
  try {
    result.value = await runBacktest(params)
  } finally {
    loading.value = false
  }
}
</script>
```

- [ ] **Step 2: 创建回测配置表单**

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
        <label class="block text-sm font-medium mb-1">费用模型</label>
        <select v-model="form.feeModel" class="w-full border rounded px-3 py-2">
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
      <textarea v-model="form.strategyCode" class="w-full border rounded px-3 py-2 font-mono text-sm h-48"
        placeholder="import pandas as pd&#10;from engine.strategies import IndicatorStrategy&#10;&#10;class MyStrategy(IndicatorStrategy):&#10;    def generate_signals(self, df):&#10;        signals = pd.Series(0, index=df.index)&#10;        signals[df['close'] > df['close'].rolling(20).mean()] = 1&#10;        signals[df['close'] < df['close'].rolling(20).mean()] = -1&#10;        return signals"
        required />
    </div>
    <button type="submit" class="w-full bg-primary text-white py-2 rounded hover:opacity-90" :disabled="loading">
      {{ loading ? '回测中...' : '开始回测' }}
    </button>
  </form>
</template>

<script setup lang="ts">
defineProps<{ loading: boolean }>()
const emit = defineEmits<{ submit: [payload: any] }>()

const form = reactive({
  ticker: '',
  startDate: '2024-01-01',
  endDate: '2025-01-01',
  initialCapital: 1000000,
  feeModel: 'a_stock',
  strategyCode: '',
})

const submit = () => emit('submit', { ...form })
</script>
```

- [ ] **Step 3: 创建回测结果面板**

```vue
<!-- web/admin/app/components/backtest/ResultPanel.vue -->
<template>
  <div class="space-y-4">
    <div v-if="result.status === 'failed'" class="border border-red-300 rounded p-4 text-red-600">
      回测失败：{{ result.error }}
    </div>

    <template v-else>
      <div class="grid grid-cols-3 gap-3">
        <div class="border rounded p-3 text-center">
          <div class="text-xs text-muted">总收益</div>
          <div class="text-lg font-bold" :class="result.metrics.totalReturn >= 0 ? 'text-green-600' : 'text-red-600'">
            {{ (result.metrics.totalReturn * 100).toFixed(2) }}%
          </div>
        </div>
        <div class="border rounded p-3 text-center">
          <div class="text-xs text-muted">Sharpe</div>
          <div class="text-lg font-bold">{{ result.metrics.sharpe?.toFixed(2) || '-' }}</div>
        </div>
        <div class="border rounded p-3 text-center">
          <div class="text-xs text-muted">最大回撤</div>
          <div class="text-lg font-bold text-red-600">{{ ((result.metrics.maxDrawdown || 0) * 100).toFixed(2) }}%</div>
        </div>
        <div class="border rounded p-3 text-center">
          <div class="text-xs text-muted">胜率</div>
          <div class="text-lg font-bold">{{ ((result.metrics.winRate || 0) * 100).toFixed(1) }}%</div>
        </div>
        <div class="border rounded p-3 text-center">
          <div class="text-xs text-muted">盈亏比</div>
          <div class="text-lg font-bold">{{ (result.metrics.profitFactor || 0).toFixed(2) }}</div>
        </div>
        <div class="border rounded p-3 text-center">
          <div class="text-xs text-muted">交易次数</div>
          <div class="text-lg font-bold">{{ result.metrics.tradeCount || 0 }}</div>
        </div>
      </div>

      <div v-if="result.trades?.length">
        <h3 class="font-semibold mb-2 text-sm">交易记录</h3>
        <div class="max-h-48 overflow-y-auto">
          <table class="w-full text-xs">
            <thead>
              <tr class="border-b">
                <th class="text-left py-1">时间</th>
                <th class="text-left py-1">方向</th>
                <th class="text-right py-1">价格</th>
                <th class="text-right py-1">盈亏</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(t, i) in result.trades" :key="i" class="border-b">
                <td class="py-1">{{ t.time }}</td>
                <td class="py-1" :class="t.side === 'buy' ? 'text-green-600' : 'text-red-600'">{{ t.side }}</td>
                <td class="text-right py-1">{{ Number(t.price).toFixed(2) }}</td>
                <td class="text-right py-1" :class="t.pnl > 0 ? 'text-green-600' : t.pnl < 0 ? 'text-red-600' : ''">
                  {{ t.pnl != null ? (t.pnl > 0 ? '+' : '') + Number(t.pnl).toFixed(0) : '-' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
defineProps<{ result: any }>()
</script>
```

- [ ] **Step 4: Commit**

```bash
git add web/admin/app/pages/strategy/ web/admin/app/components/backtest/
git commit -m "feat: add backtest page with config form and result panel"
```

---

## Task 12: 导航菜单更新

**Files:**
- Modify: `web/admin/app/constants/menus.ts`

- [ ] **Step 1: 更新导航菜单**

在菜单配置中添加研究站和策略回测入口。

- [ ] **Step 2: Commit**

```bash
git add web/admin/app/constants/menus.ts
git commit -m "feat: add research and backtest to navigation menu"
```

---

## Task 13: 集成验证

- [ ] **Step 1: 构建所有 Docker 镜像**

```bash
cd /Users/xuan/Documents/trading-agent
docker compose build
```

- [ ] **Step 2: 启动所有服务**

```bash
docker compose up -d
docker compose ps
# 预期：9 个服务 running（postgres, redis, adminer, redis-commander, api, market-data, scheduler, web + litellm, voltagent, backtest）
```

- [ ] **Step 3: 验证 API**

```bash
curl http://localhost:4000/                    # Hono API health
curl http://localhost:8002/api/health          # Backtest health
```

- [ ] **Step 4: 验证前端**

```
浏览器打开 http://localhost:3000
登录 → 导航到 AI 投研分析 → 输入股票代码 → 点击快速分析
等待分析完成 → 查看结果卡片
```

- [ ] **Step 5: 验证回测**

```
导航到策略回测 → 输入股票代码和策略代码 → 开始回测
查看结果面板（指标 + 交易记录）
```

- [ ] **Step 6: 最终 Commit**

```bash
git add -A
git commit -m "feat: complete Phase 1a - runnable analysis + backtest flow"
```

---

## Spec 覆盖检查

| Phase 1a 目标 | 覆盖 Task |
|---|---|
| LiteLLM 基础设施 | Task 1, 6 |
| BullMQ 消息队列 | Task 2 |
| 分析任务 API（入队/查询/SSE） | Task 3 |
| VoltAgent 服务（单 Agent 快速分析） | Task 4 |
| 回测服务（引擎+费用+API） | Task 5 |
| Docker Compose 集成 | Task 6 |
| Nuxt Proxy 多后端 | Task 7 |
| 前端 Composables | Task 8 |
| AI 信号 + 分析卡片组件 | Task 9 |
| 研究站页面 | Task 10 |
| 回测页面 | Task 11 |
| 导航菜单 | Task 12 |
| 集成验证 | Task 13 |
