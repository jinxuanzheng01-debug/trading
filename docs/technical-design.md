# 量化分析平台技术方案

## 一、项目概述

**项目名称**：量化分析平台（Trading Agent）
**产品定位**：面向散户的AI辅助市场分析平台
**技术目标**：构建高性能、可扩展、易维护的全栈量化分析系统

---

## 二、整体架构设计

### 2.1 架构原则

- **前后端分离**：独立演进，弹性扩展
- **微服务化**：核心业务模块解耦
- **数据驱动**：多源数据聚合，统一清洗存储
- **AI优先**：LLM深度集成，智能化分析

### 2.2 系统架构图

```
┌─────────────────────────────────────────────────────────────────────┐
│                              Client Layer                            │
├─────────────────────────────────────────────────────────────────────┤
│  Web App (Nuxt 4 + NuxtUI)    │    Mobile App (Capacitor/RN)        │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                            API Gateway                                │
│                    (Nuxt Nitro / Traefik)                            │
└─────────────────────────────────────────────────────────────────────┘
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        ▼                           ▼                           ▼
┌───────────────┐          ┌───────────────┐          ┌───────────────┐
│  Market Data  │          │  AI/Analysis  │          │   User Core   │
│    Service    │          │    Service    │          │    Service    │
└───────────────┘          └───────────────┘          └───────────────┘
        │                           │                           │
        ▼                           ▼                           ▼
┌───────────────┐          ┌───────────────┐          ┌───────────────┐
│  Redis Cache  │          │   LLM Router  │          │  PostgreSQL   │
│  + TSDB       │          │  (Multi-LLM)  │          │   (User DB)   │
└───────────────┘          └───────────────┘          └───────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        Data Sources Layer                            │
│   (CCXT / yfinance / AKShare / News APIs / Economic Calendar)       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 三、技术栈选型

### 3.1 前端技术栈

| 技术 | 选型 | 理由 |
|------|------|------|
| 框架 | **Nuxt 4** | SSR/SSG支持、SEO友好、与Vue生态兼容 |
| UI组件 | **NuxtUI** | 基于shadcn-vue，组件丰富、Tailwind集成 |
| 图表库 | **Lightweight Charts** | TradingView开源，性能优秀，金融级 |
| 状态管理 | **Pinia** | Vue官方推荐，TypeScript友好 |
| 实时通信 | **Socket.io / SSE** | 行情推送、价格提醒 |
| 移动端 | **Capacitor** | Web技术栈转原生App，代码复用 |

### 3.2 后端技术栈

| 技术 | 选型 | 理由 |
|------|------|------|
| 主框架 | **Nitropack (Nuxt Server)** | 全栈TypeScript，与前端统一生态 |
| 量化计算 | **Python (FastAPI)** | TA-Lib、pandas、numpy生态成熟 |
| 任务队列 | **BullMQ (Redis)** | 回测任务、定时扫描 |
| AI集成 | **LangChain / Vercel AI** | 多LLM支持，Prompt管理 |

### 3.3 数据存储

| 存储 | 选型 | 用途 |
|------|------|------|
| 关系数据库 | **PostgreSQL 16** | 用户数据、自选列表、策略配置 |
| 时序数据库 | **TimescaleDB** | K线数据、指标数据 |
| 缓存 | **Redis 7** | 实时行情、热点数据、会话 |
| 文档存储 | **MinIO / S3** | 历史回测报告、AI分析记录 |

### 3.4 数据源集成

| 市场 | 数据源 | 覆盖范围 |
|------|--------|----------|
| 加密货币 | **CCXT** | 100+ CEX/DEX |
| 美股/港股 | **yfinance** | 免费覆盖主流市场 |
| A股 | **AKShare** | 免费开源A股数据 |
| 财经新闻 | **金十/财联社 RSS** | 实时资讯聚合 |
| 宏观数据 | **TradingEconomics API** | 经济日历、指标 |

---

## 四、数据层设计

### 4.1 PostgreSQL 核心表设计

```sql
-- 用户表
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE,
    phone VARCHAR(20) UNIQUE,
    password_hash VARCHAR(255),
    oauth_provider VARCHAR(50),
    oauth_id VARCHAR(255),
    preferences JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 自选分组
CREATE TABLE watchlist_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 自选标的
CREATE TABLE watchlist_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID REFERENCES watchlist_groups(id) ON DELETE CASCADE,
    symbol VARCHAR(50) NOT NULL,
    exchange VARCHAR(20),
    sort_order INT DEFAULT 0,
    added_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(group_id, symbol, exchange)
);

-- 策略配置
CREATE TABLE strategies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    config JSONB NOT NULL,  -- 存储策略配置
    is_template BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 回测结果
CREATE TABLE backtest_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    strategy_id UUID REFERENCES strategies(id) ON DELETE CASCADE,
    symbol VARCHAR(50) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    metrics JSONB NOT NULL,  -- 收益率、最大回撤、夏普比率等
    trades JSONB,  -- 交易明细
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 价格提醒
CREATE TABLE price_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    symbol VARCHAR(50) NOT NULL,
    exchange VARCHAR(20),
    alert_type VARCHAR(20),  -- 'above'/'below'/'change_percent'
    target_price DECIMAL(20,8),
    change_percent DECIMAL(10,4),
    is_active BOOLEAN DEFAULT TRUE,
    triggered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- AI分析历史
CREATE TABLE ai_analysis_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    symbol VARCHAR(50) NOT NULL,
    exchange VARCHAR(20),
    analysis_result JSONB NOT NULL,
    model_used VARCHAR(50),
    prompt_tokens INT,
    completion_tokens INT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 4.2 TimescaleDB K线数据设计

```sql
-- K线数据表（超表）
CREATE TABLE ohlcv (
    time TIMESTAMPTZ NOT NULL,
    symbol VARCHAR(50) NOT NULL,
    exchange VARCHAR(20),
    timeframe VARCHAR(10) NOT NULL,  -- '1m'/'5m'/'1h'/'1d'等
    open DECIMAL(20,8),
    high DECIMAL(20,8),
    low DECIMAL(20,8),
    close DECIMAL(20,8),
    volume DECIMAL(30,2),
    quote_volume DECIMAL(30,2)
);

-- 转换为超表，按时间分区
SELECT create_hypertable('ohlcv', 'time');

-- 创建索引
CREATE INDEX idx_ohlcv_symbol_time ON ohlcv(symbol, time DESC);
CREATE INDEX idx_ohlcv_symbol_timeframe ON ohlcv(symbol, timeframe, time DESC);
```

### 4.3 Redis 缓存策略

```
# 实时行情缓存（5秒过期）
market:quote:{symbol}:{exchange} -> JSON (5s TTL)

# K线缓存（按时间框架不同过期时间）
market:kline:{symbol}:{timeframe} -> JSON (60s TTL)

# 技术指标缓存
market:indicator:{symbol}:{indicator}:{params} -> JSON (300s TTL)

# AI分析结果缓存（减少重复调用）
ai:analysis:{symbol}:{model}:{hash} -> JSON (1800s TTL)

# 用户会话
session:{user_id} -> JSON (86400s TTL)

# 价格提醒待处理队列
alerts:pending -> Sorted Set (score = 触发时间)
```

---

## 五、服务层设计

### 5.1 市场数据服务 (Market Data Service)

**职责**：数据获取、清洗、缓存、分发

**核心模块**：

```typescript
// 服务架构
MarketDataService
├── DataSourceAdapter      // 多数据源适配器
│   ├── CCXTAdapter        // 加密货币
│   ├── YFinanceAdapter    // 美股/港股
│   └── AKShareAdapter     // A股
├── DataNormalizer         // 数据标准化
├── CacheManager           // 缓存管理
├── WebSocketServer        // 实时推送
└── DataPipeline           // ETL管道
```

**数据获取流程**：

```
1. 客户端请求 -> API Gateway
2. 检查Redis缓存 -> 命中则返回
3. 缓存未命中 -> 调用数据源
4. 数据标准化 -> 存入PostgreSQL/TimescaleDB
5. 更新Redis缓存 -> 返回客户端
```

**实时推送**：

```typescript
// 使用WebSocket推送价格更新
io.on('connection', (socket) => {
    socket.on('subscribe', (symbols: string[]) => {
        symbols.forEach(symbol => {
            socket.join(`market:${symbol}`);
        });
    });
});

// 价格更新时广播
function broadcastPriceUpdate(symbol: string, data: QuoteData) {
    io.to(`market:${symbol}`).emit('price:update', data);
}
```

### 5.2 AI分析服务 (AI Analysis Service)

**职责**：LLM调用、Prompt管理、分析结果缓存

**多LLM路由设计**：

```typescript
// LLM路由器
class LLMRouter {
    private providers: Map<string, LLMProvider>;

    constructor() {
        this.providers = new Map([
            ['anthropic', new AnthropicProvider()],
            ['openai', new OpenAIProvider()],
            ['deepseek', new DeepSeekProvider()],
            ['openrouter', new OpenRouterProvider()],
        ]);
    }

    // 根据用户配置/成本/性能选择模型
    async analyze(request: AnalysisRequest): Promise<AnalysisResult> {
        const provider = this.selectProvider(request.options);
        return provider.complete(request.prompt, request.context);
    }
}
```

**Prompt模板管理**：

```typescript
// 结构化Prompt模板
const ANALYSIS_PROMPTS = {
    singleAsset: `
你是一个专业的市场分析助手。请分析以下标的：

# 标的信息
- 代码: {symbol}
- 当前价格: {price}
- 24h涨跌: {change}%

# 技术指标
{indicators_summary}

# K线形态
{patterns_summary}

# 近期新闻
{recent_news}

请提供：
1. 核心结论（看涨/看跌/中性，附带置信度%）
2. 主要理由（3-5条）
3. 风险提示（2-3条）
4. 止盈参考价（基于技术位）
5. 止损参考价（基于ATR）

请用简洁的大白话，避免专业术语。
`,

    marketRadar: `
扫描市场，找出符合以下条件的标的：
- 突破关键形态
- 量价异动
- 技术信号强烈

返回最多10个机会，每个包含：标的、方向、简短理由。
`
};
```

### 5.3 回测服务 (Backtest Service)

**架构**：Python FastAPI独立服务

```python
# 服务架构
BacktestService
├── StrategyEngine      # 策略引擎
├── DataLoader          # 数据加载
├── IndicatorCalc       # 指标计算 (TA-Lib)
├── BacktestRunner      # 回测执行器
├── PerformanceAnalyzer # 性能分析
└── ResultVisualizer    # 结果可视化
```

**回测流程**：

```python
async def run_backtest(strategy_config: StrategyConfig):
    # 1. 加载历史数据
    data = await load_ohlcv(symbol, start_date, end_date)

    # 2. 计算技术指标
    indicators = calculate_indicators(data, strategy_config.indicators)

    # 3. 生成交易信号
    signals = generate_signals(indicators, strategy_config.rules)

    # 4. 模拟交易执行
    trades = simulate_trading(signals, data, strategy_config.risk_params)

    # 5. 计算性能指标
    metrics = calculate_metrics(trades, data)

    # 6. 生成AI解读
    ai_insight = await llm_service.interpret_results(metrics, trades)

    return {
        'metrics': metrics,
        'trades': trades,
        'ai_insight': ai_insight
    }
```

### 5.4 通知服务 (Notification Service)

**职责**：价格提醒、事件通知、推送分发

```typescript
class AlertService {
    // 价格监控
    async monitorPrices() {
        const alerts = await this.getActiveAlerts();
        for (const alert of alerts) {
            const currentPrice = await this.getPrice(alert.symbol);
            if (this.shouldTrigger(alert, currentPrice)) {
                await this.notifyUser(alert.user_id, {
                    type: 'price_alert',
                    symbol: alert.symbol,
                    message: `${alert.symbol} 已到达 ${currentPrice}`
                });
            }
        }
    }

    // 多渠道推送
    async notifyUser(userId: string, message: NotificationMessage) {
        const user = await this.getUserPreferences(userId);
        if (user.push_enabled) {
            await this.fcm.send(userId, message);
        }
        if (user.email_enabled) {
            await this.email.send(user.email, message);
        }
    }
}
```

---

## 六、前端架构设计

### 6.1 目录结构

```
trading-agent/
├── components/
│   ├── chart/              # K线图表组件
│   │   ├── KLineChart.vue
│   │   ├── TimeframeSelector.vue
│   │   ├── ChartControls.vue
│   │   └── DrawingTools.vue
│   ├── indicator/          # 技术指标组件
│   │   ├── IndicatorPanel.vue
│   │   └── SignalMarker.vue
│   ├── ai/                 # AI分析组件
│   │   ├── AIAnalysisCard.vue
│   │   ├── MarketRadar.vue
│   │   └── AIDailyReport.vue
│   └── watchlist/          # 自选列表组件
│       ├── WatchlistPanel.vue
│       └── AddSymbolDialog.vue
├── composables/
│   ├── useMarketData.ts    # 行情数据Hook
│   ├── useWebSocket.ts     # WebSocket连接
│   ├── useAIAnalysis.ts    # AI分析Hook
│   └── useBacktest.ts      # 回测Hook
├── stores/
│   ├── market.ts           # 行情状态
│   ├── user.ts             # 用户状态
│   └── ui.ts               # UI状态
├── server/
│   ├── routes/
│   │   ├── market.ts       # 行情API
│   │   ├── ai.ts           # AI分析API
│   │   └── backtest.ts     # 回测API
│   └── services/
│       ├── market.ts
│       ├── ai.ts
│       └── data.ts
└── types/
    └── index.d.ts
```

### 6.2 核心Composable示例

```typescript
// composables/useMarketData.ts
export function useMarketData(symbol: string) {
    const state = reactive({
        ohlcv: [],
        currentPrice: null,
        loading: false,
        error: null
    });

    const { $ws } = useNuxtApp();

    // 获取历史K线
    async function fetchOHLCV(timeframe: string, limit: number = 500) {
        state.loading = true;
        try {
            const data = await $fetch('/api/market/kline', {
                params: { symbol, timeframe, limit }
            });
            state.ohlcv = data;
        } catch (err) {
            state.error = err;
        } finally {
            state.loading = false;
        }
    }

    // 实时价格订阅
    function subscribePrice() {
        $ws.emit('subscribe', [symbol]);
        $ws.on(`price:update:${symbol}`, (price) => {
            state.currentPrice = price;
        });
    }

    onMounted(() => {
        fetchOHLCV('1d');
        subscribePrice();
    });

    return {
        ...toRefs(state),
        fetchOHLCV,
        subscribePrice
    };
}
```

### 6.3 K线图表组件

```vue
<!-- components/chart/KLineChart.vue -->
<script setup lang="ts">
import { createChart, IChartApi, ISeriesApi } from 'lightweight-charts';

const props = defineProps<{
    symbol: string;
    data: OHLCVData[];
    indicators?: IndicatorData[];
}>();

const chartContainer = ref<HTMLElement>();
let chart: IChartApi;
let candleSeries: ISeriesApi<'Candlestick'>;

onMounted(() => {
    chart = createChart(chartContainer.value, {
        width: chartContainer.value.clientWidth,
        height: 400,
        layout: {
            background: { color: '#1a1a1a' },
            textColor: '#d1d4dc',
        },
        grid: {
            vertLines: { color: 'rgba(42, 46, 57, 0.5)' },
            horzLines: { color: 'rgba(42, 46, 57, 0.5)' },
        },
    });

    candleSeries = chart.addCandlestickSeries({
        upColor: '#26a69a',
        downColor: '#ef5350',
    });

    candleSeries.setData(props.data);

    // 添加技术指标
    if (props.indicators) {
        props.indicators.forEach(indicator => {
            const series = chart.addLineSeries({
                color: indicator.color,
                lineWidth: 2,
            });
            series.setData(indicator.data);
        });
    }
});

onUnmounted(() => {
    chart?.remove();
});
</script>
```

---

## 七、部署方案

### 7.1 开发环境

```yaml
# docker-compose.yml
version: '3.8'
services:
  # 前端开发服务
  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    volumes:
      - ./frontend:/app
    environment:
      - NUXT_PUBLIC_API_URL=http://localhost:3001

  # 后端API服务
  api:
    build: ./backend
    ports:
      - "3001:3001"
    environment:
      - DATABASE_URL=postgresql://user:pass@postgres:5432/trading
      - REDIS_URL=redis://redis:6379
    depends_on:
      - postgres
      - redis

  # Python回测服务
  backtest:
    build: ./services/backtest
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=postgresql://user:pass@postgres:5432/trading

  postgres:
    image: timescale/timescaledb:pg16
    environment:
      - POSTGRES_DB=trading
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
```

### 7.2 生产环境

```
┌─────────────────────────────────────────────────────────────────┐
│                         CDN / WAF                                │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Kubernetes Cluster                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐           │
│   │   Nuxt App  │   │  API Server │   │  Backtest   │           │
│   │   (SSR)     │   │  (Nitro)    │   │   Service   │           │
│   └─────────────┘   └─────────────┘   └─────────────┘           │
│         │                  │                  │                   │
│         └──────────────────┴──────────────────┘                   │
│                            │                                     │
│                   ┌────────┴────────┐                            │
│                   ▼                 ▼                            │
│           ┌─────────────┐   ┌─────────────┐                      │
│           │ PostgreSQL  │   │   Redis     │                      │
│           │ + Timescale │   │   Cluster   │                      │
│           └─────────────┘   └─────────────┘                      │
└─────────────────────────────────────────────────────────────────┘
```

**推荐云服务**：
- **国内**：阿里云 ACK + RDS PostgreSQL + Redis企业版
- **海外**：Railway/Render/Fly.io（快速部署）

---

## 八、MVP实施路径

### Phase 1: 核心行情展示 (4-6周)

**目标**：用户能查看K线图和基础指标

| 模块 | 内容 |
|------|------|
| 前端 | K线图表、时间框架切换、MA/MACD/RSI指标 |
| 后端 | 数据源集成（CCXT+yfinance）、行情API |
| 数据库 | TimescaleDB K线存储、Redis缓存 |

**验收**：
- 加载BTC/USD日K线 < 2秒
- 切换时间框架无刷新
- 指标叠加显示正确

### Phase 2: AI分析能力 (3-4周)

**目标**：AI一键分析、市场雷达

| 模块 | 内容 |
|------|------|
| AI服务 | LLM路由、Prompt模板、分析API |
| 前端 | AI分析卡片、结果展示、历史记录 |
| 数据 | 新闻数据源、情绪指标 |

**验收**：
- AI分析响应 < 10秒
- 结果结构化展示（结论+理由+风险）
- 分析历史可追溯

### Phase 3: 用户系统与自选 (2-3周)

**目标**：用户登录、自选管理、价格提醒

| 模块 | 内容 |
|------|------|
| 用户 | OAuth登录、用户数据、跨端同步 |
| 自选 | 分组管理、实时更新、拖拽排序 |
| 提醒 | 价格监控、推送通知 |

**验收**：
- 支持邮箱+Google登录
- 自选列表实时更新
- 价格提醒延迟 < 30秒

### Phase 4: 策略回测 (4-5周)

**目标**：可视化配置、回测执行、结果解读

| 模块 | 内容 |
|------|------|
| 策略 | 拖拽式配置、预设模板 |
| 回测 | Python服务、TA-Lib集成 |
| 结果 | 性能指标、权益曲线、AI解读 |

**验收**：
- 配置策略 < 5步完成
- 回测执行 < 30秒（1年数据）
- AI解读辅助理解

### Phase 5: 完善与优化 (持续)

- 移动端适配
- 性能优化
- 更多数据源/指标
- 社区分享功能

---

## 九、技术风险与应对

| 风险 | 应对措施 |
|------|----------|
| 数据源不稳定 | 多源备份、本地缓存、降级策略 |
| AI成本过高 | 缓存优先、用户自备Key、模型分层 |
| 实时性能要求 | Redis缓存、WebSocket推送、数据库优化 |
| A股数据合规 | 先做海外市场、后期申请牌照 |
| K线图表性能 | 数据分页、Canvas渲染、虚拟滚动 |

---

## 十、待决策事项

| 决策项 | 选项A | 选项B | 建议 |
|--------|-------|-------|------|
| AI Key管理 | 用户自备 | 平台统一 | 混合：免费额度平台付费，超量用户自备 |
| 移动端方案 | Capacitor | React Native | Capacitor（代码复用高） |
| 回测执行 | 同步 | 异步队列 | 异步（大数据量时用户体验好） |
| WebSocket | 自建 | 第三方服务 | 自建（降低成本） |

---

*文档版本: v1.0*
*创建日期: 2026-05-20*
