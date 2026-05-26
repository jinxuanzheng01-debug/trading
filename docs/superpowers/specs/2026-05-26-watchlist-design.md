# 自选股功能设计文档

**日期**: 2026-05-26
**版本**: MVP v1.4
**状态**: 设计已完成，待实施

## 1. 概述

### 1.1 项目背景

Trading Agent 是一个面向散户投资者的 AI 辅助量化分析平台。当前项目已完成基础的 Watchlist CRUD 功能（分组和标的的管理），但尚未集成市场数据。本设计旨在实现一个参考长桥/富途、具备差异化竞争力的自选股功能。

### 1.2 目标

构建一个支持多市场（A股/港股/美股）的自选股系统，提供 T+1 行情展示、排序筛选功能。数据本地缓存，支持后续回测功能。

### 1.3 数据维度

支持三个时间维度的 K 线数据：
- **日线 (1d)**：每日收盘后更新
- **周线 (1w)**：每周收盘后更新
- **月线 (1m)**：每月收盘后更新

### 1.4 MVP 范围

**包含功能：**
- T+1 行情展示（昨收盘价、涨跌幅、成交量）
- 排序和筛选（价格/涨跌幅/成交量）
- 多市场支持，分市场定时更新
- 本地数据缓存（日线/周线/月线），支持回测

**暂不包含（Phase 2）：**
- 分钟级 K 线（30m、1h、5m）
- 实时行情和自动刷新
- 迷你分时图 sparkline
- 异动检测（价格/成交量异常）
- AI 分析
- 公告摘要
- WebSocket 实时推送

## 2. 系统架构

### 2.1 架构图

```
┌─────────────────────────────────────────────────────────────┐
│                         前端层                              │
│  ┌──────────────┐  ┌──────────────┐                         │
│  │ 自选股列表页  │  │  标的详情页   │                         │
│  │  (调用 API)   │  │  (调用 API)   │                         │
│  └──────┬───────┘  └──────┬───────┘                         │
└─────────┼──────────────────┼─────────────────────────────────┘
          │                  │
┌─────────┼──────────────────┼─────────────────────────────────┐
│         ▼                  ▼                                  │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                    后端 API 层                        │    │
│  │  api/business (Hono + PostgreSQL)                    │    │
│  │                                                       │    │
│  │  GET /api/watchlist/groups/:id/quotes                │    │
│  │    → 查询 stock_quotes (基础设施层)                   │    │
│  │    → 调用 market-data 补充缺失数据                     │    │
│  │    → 聚合返回数据                                     │    │
│  └───────────────────────┬─────────────────────────────┘    │
│                           │                                  │
│         ┌─────────────────┴─────────────────┐              │
│         ▼                                   ▼              │
│  ┌──────────────┐                   ┌──────────────┐      │
│  │ 数据服务层    │                   │  定时任务层   │      │
│  │ market-data  │                   │  分市场更新   │      │
│  │ (FastAPI)    │                   │  1d/1w/1m     │      │
│  └──────────────┘                   └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 数据流

**查询自选股列表行情：**
```
前端 → GET /api/watchlist/groups/:id/quotes
     → 后端查询 watchlist_items 获取标的列表
     → 查询 stock_quotes 获取行情（按 symbol）
     → 缺失或过期的数据调用 market-data 补充
     → 聚合数据返回前端
```

**添加新标的：**
```
前端 → POST /api/watchlist/groups/:id/items
     → 后端保存到 watchlist_items 表
     → 调用 market-data 获取 K 线数据（1d/1w/1m）
     → 存入 stock_quotes 和 stock_quote_history
     → 返回结果
```

**定时更新（分市场）：**
```
A 股 15:35 → 调用 market-data → 更新 1d/1w/1m → 入库
港股 16:35 → 调用 market-data → 更新 1d/1w/1m → 入库
美股 04:35 → 调用 market-data → 更新 1d/1w/1m → 入库
```

## 3. 数据库设计

### 3.1 基础设施层：股票行情表

**stock_quotes（最新缓存，热数据）**
```sql
-- 股票行情最新数据缓存（基础设施层）
CREATE TABLE stock_quotes (
  symbol VARCHAR(50) PRIMARY KEY,
  market VARCHAR(20) NOT NULL,         -- CN/US/HK
  name VARCHAR(100),
  type VARCHAR(20),                    -- stock/etf/index/crypto
  exchange VARCHAR(50),
  interval VARCHAR(10) NOT NULL,       -- 1d/1w/1m
  open DECIMAL(12, 4),
  high DECIMAL(12, 4),
  low DECIMAL(12, 4),
  close DECIMAL(12, 4),
  volume BIGINT,
  amount BIGINT,
  change DECIMAL(12, 4),
  change_percent DECIMAL(8, 4),
  turnover_rate DECIMAL(8, 4),         -- 换手率
  timestamp TIMESTAMPTZ NOT NULL,      -- K线时间
  data_date DATE NOT NULL,             -- 数据日期
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(symbol, interval)
);

CREATE INDEX idx_stock_quotes_market ON stock_quotes(market);
CREATE INDEX idx_stock_quotes_interval ON stock_quotes(interval);
```

**stock_quote_history（历史数据，冷数据）**
```sql
-- 股票历史 K 线数据（基础设施层，回测用）
CREATE TABLE stock_quote_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol VARCHAR(50) NOT NULL,
  market VARCHAR(20) NOT NULL,         -- CN/US/HK
  interval VARCHAR(10) NOT NULL,       -- 1d/1w/1m
  open DECIMAL(12, 4),
  high DECIMAL(12, 4),
  low DECIMAL(12, 4),
  close DECIMAL(12, 4),
  volume BIGINT,
  amount BIGINT,
  change DECIMAL(12, 4),
  change_percent DECIMAL(8, 4),
  timestamp TIMESTAMPTZ NOT NULL,      -- K线时间
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(symbol, market, interval, timestamp)
);

CREATE INDEX idx_history_symbol_interval_time ON stock_quote_history(symbol, interval, timestamp DESC);
```

### 3.2 业务层：自选股表

**修改 watchlist_items**
```sql
-- 添加排序字段
ALTER TABLE watchlist_items ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

-- 添加市场字段（如果还没有）
ALTER TABLE watchlist_items ADD COLUMN IF NOT EXISTS market VARCHAR(20);
-- 市场值: 'CN' (A股), 'US' (美股), 'HK' (港股)
```

**关系说明：**
- `watchlist_items.symbol` → `stock_quotes.symbol`（引用关系）
- 删除自选股标的时，**不删除** stock_quotes 数据（通用基础设施）
- 添加自选股标的时，如果 stock_quotes 已有数据则直接使用

### 3.3 数据保留策略

| 表 | 保留策略 | 用途 |
|----|---------|------|
| stock_quotes | 仅保留最新（每 symbol 每 interval 一条） | 前端展示 |
| stock_quote_history | 永久保留 | 回测、历史分析 |

### 3.4 历史数据初始拉取

| 周期 | 拉取范围 | 数据量估算 |
|------|----------|-----------|
| 日线 (1d) | 3 年 | ~750 条/股票 |
| 周线 (1w) | 5 年 | ~250 条/股票 |
| 月线 (1m) | 10 年 | ~120 条/股票 |

**拉取方式：** 首次添加标的时，后台异步一次性拉取 1d/1w/1m 三个周期的全部历史数据。前端先显示最新数据，历史数据在后台加载完成后可用。

**定时同步范围：** 每天定时任务同步所有用户自选股中的标的（去重后的 symbol 列表），确保数据持续更新。

## 4. API 接口设计

### 4.1 自选股行情接口（新增）

```
GET /api/watchlist/groups/:groupId/quotes
```

**响应：**
```json
{
  "group": {
    "id": "uuid",
    "name": "我的自选",
    "itemCount": 12
  },
  "quotes": [
    {
      "itemId": "uuid",
      "symbol": "AAPL",
      "name": "Apple Inc.",
      "type": "stock",
      "exchange": "NASDAQ",
      "market": "US",
      "interval": "1d",
      "open": 177.80,
      "high": 179.00,
      "low": 177.50,
      "close": 178.52,
      "volume": 52340000,
      "change": 2.35,
      "changePercent": 1.33,
      "timestamp": "2026-05-23T04:00:00Z",
      "sortOrder": 0
    }
  ],
  "summary": {
    "total": 12,
    "up": 7,
    "down": 4,
    "flat": 1
  }
}
```

### 4.2 排序接口（新增）

```
PUT /api/watchlist/groups/:groupId/reorder
Content-Type: application/json

{
  "itemIds": ["uuid1", "uuid2", "uuid3"]
}
```

### 4.3 手动刷新接口（新增）

```
POST /api/watchlist/groups/:groupId/refresh
```

**响应：**
```json
{
  "success": true,
  "updated": 12,
  "failed": 0
}
```

### 4.4 标的详情接口（新增）

```
GET /api/watchlist/items/:itemId?interval=1w
```

支持查询不同周期的 K 线数据。

## 5. 定时任务设计

### 5.1 分市场更新时间

| 市场 | 更新时间 (北京时间) | 收盘时间 |
|------|---------------------|----------|
| A股 | 15:35 | 15:00 |
| 港股 | 16:35 | 16:00 |
| 美股 | 04:35 | 04:00 (次日) |

### 5.2 任务流程

```
1. 查询该市场的所有标的（从 stock_quotes 获取 symbol 列表）
2. 批量调用 market-data/kline 接口获取 1d/1w/1m 数据
3. 更新 stock_quotes (最新数据，UPSERT)
4. 插入 stock_quote_history (历史数据)
5. 记录更新日志
```

### 5.3 数据来源

| 市场 | 数据源 | 支持周期 |
|------|--------|----------|
| A股 | AkShare | 1d/1w/1m |
| 美股 | yfinance | 1d/1w/1m |
| 港股 | yfinance | 1d/1w/1m |

### 5.4 错误处理

- 单个标的失败：记录日志，继续处理其他标的
- market-data 不可用：重试 3 次，间隔 5 分钟
- 数据异常：跳过该标的，记录错误

## 6. 前端组件设计

### 6.1 页面结构

```
pages/watchlist/index.vue
├── WatchlistSidebar      (分组列表)
├── WatchlistToolbar      (工具栏：排序/筛选/刷新/周期切换)
├── WatchlistTable        (数据表格)
│   ├── SymbolColumn      (代码+名称+类型标签)
│   ├── PriceColumn       (OHLC + 涨跌幅)
│   ├── VolumeColumn      (成交量)
│   └── ActionsColumn     (操作)
└── StockDetailDialog     (标的详情弹窗 + K线图)
```

### 6.2 新增功能

| 功能 | 说明 |
|------|------|
| 点击列标题排序 | 价格/涨跌幅/成交量，支持升序/降序 |
| 拖拽排序 | 手动拖拽调整顺序 |
| 筛选器 | 按类型/涨跌幅/市场筛选 |
| 周期切换 | 日线/周线/月线切换 |
| 手动刷新 | 立即从 market-data 获取最新数据 |

### 6.3 排序选项

- 默认（用户自定义 sort_order）
- 收盘价（高→低 / 低→高）
- 涨跌幅（高→低 / 低→高）
- 成交量（高→低）

### 6.4 筛选器

- 按类型：股票 / ETF / 指数 / 加密货币
- 按涨跌幅：涨幅>5% / 跌幅>5% / 平盘
- 按市场：A股 / 港股 / 美股

## 7. 错误处理

### 7.1 数据获取失败

| 场景 | 处理方式 |
|------|----------|
| market-data 不可用 | 显示缓存数据 + "数据可能过期" 提示 |
| 单个标的失败 | 显示 "--"，其他标的正常显示 |
| 网络超时 | 显示 "加载超时，请重试" |

### 7.2 空状态处理

| 场景 | 处理方式 |
|------|----------|
| 空分组 | 显示引导 UI："点击 + 添加股票到自选" |
| 无缓存数据 | 显示 "暂无数据，等待定时更新或手动刷新" |

### 7.3 数据过期提示

| 场景 | 处理方式 |
|------|----------|
| 日线超过 1 天未更新 | 显示 "数据已过期" 标签 |
| 周线超过 1 周未更新 | 显示 "数据已过期" 标签 |

## 8. 性能考虑

### 8.1 前端优化

- **虚拟滚动**: 自选股 > 50 只时启用
- **分页加载**: 默认显示 50 条

### 8.2 后端优化

- **本地缓存优先**: 查询先走 stock_quotes，减少对 market-data 的依赖
- **批量更新**: 定时任务使用批量接口
- **数据库索引**: 已覆盖常用查询场景

### 8.3 时序数据库优化（未来）

- 考虑迁移到 TimescaleDB（已规划）
- 利用分区表和压缩功能

## 9. 实施计划

### 9.1 后端任务

1. **数据库迁移**
   - 新建 `stock_quotes` 表
   - 新建 `stock_quote_history` 表
   - 添加 `sort_order`、`market` 字段到 `watchlist_items`

2. **新增 API 接口** (`api/business`)
   - `GET /api/watchlist/groups/:id/quotes`
   - `PUT /api/watchlist/groups/:id/reorder`
   - `POST /api/watchlist/groups/:id/refresh`
   - `GET /api/watchlist/items/:id?interval=1w`

3. **market-data 服务增强**
   - 支持多周期 K 线接口（1d/1w/1m）
   - 批量查询优化

4. **定时任务** (scheduler 服务)
   - A 股 15:35 更新任务（1d/1w/1m）
   - 港股 16:35 更新任务（1d/1w/1m）
   - 美股 04:35 更新任务（1d/1w/1m）

5. **单元测试**

### 9.2 前端任务

1. **扩展 watchlist 页面**
   - 调用新的 `/quotes` 接口
   - 显示 OHLC 行情数据

2. **实现排序功能**
   - 点击列标题排序
   - 拖拽排序

3. **实现筛选功能**
   - 类型/涨跌幅/市场筛选

4. **周期切换**
   - 日线/周线/月线切换

5. **手动刷新按钮**

6. **样式优化**
   - 涨跌幅颜色（红涨绿跌 / 绿涨红跌可配置）

### 9.3 测试任务

1. 多市场数据验证（A股/港股/美股）
2. 多周期数据验证（1d/1w/1m）
3. 排序和筛选功能测试
4. 定时任务测试
5. 边界情况测试

## 10. 后续扩展 (Phase 2)

- **分钟级 K 线**: 30m、1h、5m
- **实时行情**: WebSocket 推送或短轮询
- **迷你分时图**: sparkline 显示日内走势
- **异动检测**: 价格/成交量异常检测和通知
- **AI 分析**: 异动原因分析、风险评估
- **公告摘要**: 智能摘要重要公告
- **更多技术指标**: MACD、KDJ、RSI 等
- **多股同列**: 对比视图
- **回测功能**: 基于 stock_quote_history 的策略回测
- **TimescaleDB**: 迁移到时序数据库

## 11. 附录

### 11.1 参考文档

- 长桥自选股功能: https://longbridge.com
- 富途/Moomoo 自选股: https://www.moomoo.com
- core-infra 规格: `/Users/xuan/Documents/xuan/core-infra`

### 11.2 变更历史

| 日期 | 版本 | 变更内容 |
|------|------|----------|
| 2026-05-26 | v1.0 | 初始设计，包含实时行情和异动检测 |
| 2026-05-26 | v1.1 | 简化为 T+1 数据，增加缓存表和定时任务 |
| 2026-05-26 | v1.2 | 极简版：去除缓存表，直接调用 market-data |
| 2026-05-26 | v1.3 | 加回缓存表，支持回测；分市场定时更新 |
| 2026-05-26 | v1.4 | 通用基础设施层（stock_quotes/history）；支持 1d/1w/1m 三周期 |
