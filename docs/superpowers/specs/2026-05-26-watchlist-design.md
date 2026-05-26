# 自选股功能设计文档

**日期**: 2026-05-27
**版本**: v2.0（与实际实现对齐）
**状态**: 已实施

## 1. 概述

Trading Agent 自选股系统，支持美股/港股/A股多市场，提供行情展示、K线图表、历史数据同步。

## 2. 数据库设计

### 2.1 ER 关系

```
users (id, email, username, password, role)
  ├── watchlist_groups (id, user_id, name, description, is_default)
  │     └── watchlist_items (id, group_id, stock_id, sort_order, notes)
  │           ↓ FK stock_id
  ├── stocks (id, symbol, name, name_cn, exchange, market, type)
  │     ├── stock_quotes (stock_id, interval, open, high, low, close, volume, change, change_percent, prev_close, timestamp, data_date)
  │     │     PK = (stock_id, interval)
  │     └── stock_quote_history (id, stock_id, interval, open, high, low, close, volume, timestamp)
  │           UNIQUE = (stock_id, interval, timestamp)
  ├── analysis_runs (id, user_id, ticker, ...)
  └── backtest_runs (id, user_id, ...)
```

### 2.2 stocks — 股票主数据

唯一数据源，symbol 全局唯一。name/name_cn/exchange/market/type 统一维护。

```sql
CREATE TABLE stocks (
  id SERIAL PRIMARY KEY,
  symbol VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(200),
  name_cn VARCHAR(100),
  exchange VARCHAR(20),
  market VARCHAR(20),
  type VARCHAR(20) DEFAULT 'stock',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### 2.3 watchlist_items — 纯关联表

只存关联关系，股票属性通过 stock_id JOIN stocks 获取。

```sql
CREATE TABLE watchlist_items (
  id SERIAL PRIMARY KEY,
  group_id INTEGER NOT NULL REFERENCES watchlist_groups(id) ON DELETE CASCADE,
  stock_id INTEGER REFERENCES stocks(id),
  sort_order INTEGER DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### 2.4 stock_quotes — 行情快照

每个 (stock_id, interval) 只存最新一条，UPSERT 更新。

```sql
CREATE TABLE stock_quotes (
  stock_id INTEGER NOT NULL REFERENCES stocks(id),
  interval VARCHAR(10) NOT NULL,
  open DECIMAL(12,4),
  high DECIMAL(12,4),
  low DECIMAL(12,4),
  close DECIMAL(12,4),
  volume BIGINT,
  change DECIMAL(12,4),
  change_percent DECIMAL(8,4),
  prev_close DECIMAL(12,4),
  timestamp TIMESTAMPTZ NOT NULL,
  data_date TIMESTAMP NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (stock_id, interval)
);
```

### 2.5 stock_quote_history — K线历史

按 (stock_id, interval, timestamp) 唯一，用于回测和历史分析。

```sql
CREATE TABLE stock_quote_history (
  id SERIAL PRIMARY KEY,
  stock_id INTEGER REFERENCES stocks(id),
  interval VARCHAR(10) NOT NULL,
  open DECIMAL(12,4),
  high DECIMAL(12,4),
  low DECIMAL(12,4),
  close DECIMAL(12,4),
  volume BIGINT,
  timestamp TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (stock_id, interval, timestamp)
);
```

## 3. API 设计

### 3.1 统一响应格式

所有接口返回 `{ code: number, msg: string, data: T | null }`。

| code | 含义 |
|------|------|
| 0 | 成功 |
| 40001 | 已存在该自选股 |
| 40002 | 未找到该股票代码 |
| 40401 | 分组不存在 |
| 40402 | 自选股不存在 |
| 50301 | 行情服务不可用 |

### 3.2 接口列表

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/watchlist/groups | 获取分组列表 |
| POST | /api/watchlist/groups | 创建分组 |
| PUT | /api/watchlist/groups/:id | 更新分组 |
| DELETE | /api/watchlist/groups/:id | 删除分组 |
| GET | /api/watchlist/groups/:id/items | 获取分组标的（JOIN stocks） |
| POST | /api/watchlist/groups/:id/items | 添加标的（验证→写stocks→关联） |
| DELETE | /api/watchlist/items/:id | 删除标的 |
| PUT | /api/watchlist/groups/:groupId/reorder | 拖拽排序 |
| GET | /api/watchlist-quotes/groups/:id/quotes | 获取行情 |
| POST | /api/watchlist-quotes/groups/:id/refresh | 强制刷新行情 |
| GET | /api/watchlist-quotes/items/:id/kline | K线数据 |
| POST | /api/internal/klines/sync | K线同步（scheduler调用） |
| GET | /api/internal/klines/latest | 查询最新K线日期 |
| GET | /api/internal/stocks/symbols | 获取所有股票代码 |

### 3.3 添加标的流程

```
1. symbol.toUpperCase()
2. 调 market-data 验证（price > 0 才算有效）
3. 写入 stocks（ON CONFLICT upsert）
4. 查 stocks.id
5. 检查是否已在分组中（group_id + stock_id）
6. 写入 watchlist_items
7. 发布事件到 Redis Stream → Scheduler 异步同步历史K线
```

## 4. 数据流

### 4.1 行情刷新

```
前端 → API → market-data 实时获取 → 异步写 stock_quotes (upsert) → 返回前端
```

不读 DB 缓存，每次直接调 market-data 保证实时性。

### 4.2 K线查看

```
前端 → API → market-data 实时获取 → 返回前端
```

暂不走 stock_quote_history 缓存。

### 4.3 历史K线同步

```
Scheduler:
  1. GET /api/internal/stocks/symbols（读 stocks 表全部股票）
  2. 对每个 symbol+interval:
     a. GET /api/internal/klines/latest 查本地最新日期
     b. 24h/48h/72h 内有 → 跳过
     c. 无或过期 → 调 market-data 拉K线
     d. POST /api/internal/klines/sync 写入 stock_quote_history
  3. 控频 2秒/次
```

### 4.4 定时任务

| 任务 | 时间 | 数据源 |
|------|------|--------|
| sync_all_stock_klines | 每天 06:00 | stocks 表全部 |
| sync_cn_quotes | 15:35 | A股收盘后 |
| sync_hk_quotes | 16:35 | 港股收盘后 |
| sync_us_quotes | 04:35 | 美股收盘后 |

## 5. 前端

### 5.1 自选股列表

富途/长桥风格列表布局：

```
┌──────────────────────────────────────────────┐
│  股票              最新价      涨跌幅    操作  │
├──────────────────────────────────────────────┤
│  苹果              310.12    +0.52%    📊 🗑 │
│  AAPL                                       │
├──────────────────────────────────────────────┤
│  特斯拉            432.05    +2.06%    📊 🗑 │
│  TSLA                                       │
└──────────────────────────────────────────────┘
```

- 股票名优先展示 name_cn，其次 name，最后 symbol
- 涨跌幅：红涨绿跌（国内习惯）
- 操作栏：K线详情图标 + 删除图标
- 点击整行打开 StockDetailDialog（lightweight-charts K线图）

### 5.2 添加自选

- 弹窗只输入股票代码，其他字段自动从 market-data 获取
- 无效代码弹 toast "未找到该股票代码"
- 重复添加弹 toast "已存在该自选股"
- 按钮有 loading 态

### 5.3 组件结构

```
pages/watchlist/index.vue
├── 分组侧边栏（创建/删除分组）
├── 列表区（表头 + items）
│   └── WatchlistTable（股票名+代码 | 价格 | 涨跌幅 | 操作）
├── AddStockDialog（仅输入symbol）
└── StockDetailDialog（lightweight-charts K线图）
```

## 6. 服务架构

```
frontend (Nuxt4 :3000)
  → api (Hono :4000) ─→ market-data (FastAPI :8000) ─→ yfinance / AkShare
  → scheduler (FastAPI :8001) ─→ Redis Streams 消费事件
                                 ─→ APScheduler 定时任务
                                 ─→ market-data 拉数据
                                 ─→ api 内部端点写DB

infra: PostgreSQL :5432 / Redis :6379 / Redis Dashboard :9000
```

## 7. 变更历史

| 日期 | 版本 | 内容 |
|------|------|------|
| 2026-05-26 | v1.x | 初始设计及迭代 |
| 2026-05-27 | v2.0 | DB重构：stocks主数据表，子表FK关联，watchlist_items去冗余 |
| | | 统一响应格式 {code, msg, data} |
| | | 前端富途/长桥风格，红涨绿跌，中文名优先 |
| | | K线同步基于stocks表，与自选股解耦，控频+本地检查 |
| | | 修复yfinance兼容性，Docker网络通信 |
