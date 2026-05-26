# 自选股功能设计文档

**日期**: 2026-05-26
**版本**: MVP v1.3
**状态**: 设计已完成，待实施

## 1. 概述

### 1.1 项目背景

Trading Agent 是一个面向散户投资者的 AI 辅助量化分析平台。当前项目已完成基础的 Watchlist CRUD 功能（分组和标的的管理），但尚未集成市场数据。本设计旨在实现一个参考长桥/富途、具备差异化竞争力的自选股功能。

### 1.2 目标

构建一个支持多市场（A股/港股/美股）的自选股系统，提供 T+1 行情展示、排序筛选功能。数据本地缓存，支持后续回测功能。

### 1.3 MVP 范围

**包含功能：**
- T+1 行情展示（昨收盘价、涨跌幅、成交量）
- 排序和筛选（价格/涨跌幅/成交量）
- 多市场支持，分市场定时更新
- 本地数据缓存，支持回测

**暂不包含（Phase 2）：**
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
│  │    → 查询本地缓存 (watchlist_quotes)                  │    │
│  │    → 调用 market-data 补充缺失数据                     │    │
│  │    → 聚合返回数据                                     │    │
│  └───────────────────────┬─────────────────────────────┘    │
│                           │                                  │
│         ┌─────────────────┴─────────────────┐              │
│         ▼                                   ▼              │
│  ┌──────────────┐                   ┌──────────────┐      │
│  │ 数据服务层    │                   │  定时任务层   │      │
│  │ market-data  │                   │  分市场更新   │      │
│  │ (FastAPI)    │                   │  → 入库缓存   │      │
│  └──────────────┘                   └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 数据流

**查询自选股列表行情：**
```
前端 → GET /api/watchlist/groups/:id/quotes
     → 后端查询本地缓存 watchlist_quotes
     → 缺失或过期的数据调用 market-data 补充
     → 聚合数据返回前端
```

**添加新标的：**
```
前端 → POST /api/watchlist/groups/:id/items
     → 后端保存到 watchlist_items 表
     → 调用 market-data/quote 获取行情
     → 存入 watchlist_quotes
     → 返回结果
```

**定时更新（分市场）：**
```
A 股 15:35 → 调用 market-data → 更新 watchlist_quotes + watchlist_quote_history
港股 16:35 → 调用 market-data → 更新 watchlist_quotes + watchlist_quote_history
美股 04:35 → 调用 market-data → 更新 watchlist_quotes + watchlist_quote_history
```

## 3. 数据库设计

### 3.1 新增表：watchlist_quotes（最新缓存）

```sql
-- 自选股最新行情缓存
CREATE TABLE watchlist_quotes (
  item_id UUID PRIMARY KEY REFERENCES watchlist_items(id) ON DELETE CASCADE,
  symbol VARCHAR(50) NOT NULL,
  price DECIMAL(12, 4),
  change DECIMAL(12, 4),
  change_percent DECIMAL(8, 4),
  volume BIGINT,
  market_cap BIGINT,
  prev_close DECIMAL(12, 4),
  data_date DATE NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_quotes_symbol ON watchlist_quotes(symbol);
```

### 3.2 新增表：watchlist_quote_history（历史数据）

```sql
-- 自选股历史数据（回测用）
CREATE TABLE watchlist_quote_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES watchlist_items(id) ON DELETE CASCADE,
  symbol VARCHAR(50) NOT NULL,
  price DECIMAL(12, 4),
  change DECIMAL(12, 4),
  change_percent DECIMAL(8, 4),
  volume BIGINT,
  data_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(item_id, data_date)
);

CREATE INDEX idx_history_item_date ON watchlist_quote_history(item_id, data_date DESC);
CREATE INDEX idx_history_symbol_date ON watchlist_quote_history(symbol, data_date DESC);
```

### 3.3 修改现有表：watchlist_items

```sql
-- 添加排序字段
ALTER TABLE watchlist_items ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

-- 添加市场字段
ALTER TABLE watchlist_items ADD COLUMN IF NOT EXISTS market VARCHAR(20);
-- 市场值: 'CN' (A股), 'US' (美股), 'HK' (港股)
```

### 3.4 数据保留策略

| 表 | 保留策略 | 用途 |
|----|---------|------|
| watchlist_quotes | 仅保留最新一条 | 前端展示 |
| watchlist_quote_history | 永久保留 | 回测、历史分析 |

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
      "price": 178.52,
      "change": 2.35,
      "changePercent": 1.33,
      "volume": 52340000,
      "marketCap": 2780000000000,
      "prevClose": 176.17,
      "dataDate": "2026-05-23",
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

## 5. 定时任务设计

### 5.1 分市场更新时间

| 市场 | 更新时间 (北京时间) | 收盘时间 |
|------|---------------------|----------|
| A股 | 15:35 | 15:00 |
| 港股 | 16:35 | 16:00 |
| 美股 | 04:35 | 04:00 (次日) |

### 5.2 任务流程

```
1. 查询该市场的所有自选股标的
2. 批量调用 market-data/quotes 接口
3. 更新 watchlist_quotes (最新数据，UPSERT)
4. 插入 watchlist_quote_history (历史数据)
5. 记录更新日志
```

### 5.3 数据来源

| 市场 | 数据源 |
|------|--------|
| A股 | AkShare |
| 美股 | yfinance |
| 港股 | yfinance |

### 5.4 错误处理

- 单个标的失败：记录日志，继续处理其他标的
- market-data 不可用：重试 3 次，间隔 5 分钟
- 数据异常：跳过该标的，记录错误

## 6. 前端组件设计

### 6.1 页面结构

```
pages/watchlist/index.vue
├── WatchlistSidebar      (分组列表)
├── WatchlistToolbar      (工具栏：排序/筛选/刷新)
├── WatchlistTable        (数据表格)
│   ├── SymbolColumn      (代码+名称+类型标签)
│   ├── PriceColumn       (价格+涨跌幅)
│   ├── VolumeColumn      (成交量)
│   └── ActionsColumn     (操作)
└── StockDetailDialog     (标的详情弹窗)
```

### 6.2 新增功能

| 功能 | 说明 |
|------|------|
| 点击列标题排序 | 价格/涨跌幅/成交量，支持升序/降序 |
| 拖拽排序 | 手动拖拽调整顺序 |
| 筛选器 | 按类型/涨跌幅/市场筛选 |
| 手动刷新 | 立即从 market-data 获取最新数据 |

### 6.3 排序选项

- 默认（用户自定义 sort_order）
- 价格（高→低 / 低→高）
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
| 数据超过 1 天未更新 | 显示 "数据已过期" 标签，建议手动刷新 |

## 8. 性能考虑

### 8.1 前端优化

- **虚拟滚动**: 自选股 > 50 只时启用
- **分页加载**: 默认显示 50 条

### 8.2 后端优化

- **本地缓存优先**: 查询先走本地数据库，减少对 market-data 的依赖
- **批量更新**: 定时任务使用批量接口
- **数据库索引**: 已覆盖常用查询场景

## 9. 实施计划

### 9.1 后端任务

1. **数据库迁移**
   - 新建 `watchlist_quotes` 表
   - 新建 `watchlist_quote_history` 表
   - 添加 `sort_order`、`market` 字段到 `watchlist_items`

2. **新增 API 接口** (`api/business`)
   - `GET /api/watchlist/groups/:id/quotes`
   - `PUT /api/watchlist/groups/:id/reorder`
   - `POST /api/watchlist/groups/:id/refresh`

3. **定时任务** (scheduler 服务)
   - A 股 15:35 更新任务
   - 港股 16:35 更新任务
   - 美股 04:35 更新任务

4. **单元测试**

### 9.2 前端任务

1. **扩展 watchlist 页面**
   - 调用新的 `/quotes` 接口
   - 显示行情数据

2. **实现排序功能**
   - 点击列标题排序
   - 拖拽排序

3. **实现筛选功能**
   - 类型/涨跌幅/市场筛选

4. **手动刷新按钮**

5. **样式优化**
   - 涨跌幅颜色（红涨绿跌 / 绿涨红跌可配置）

### 9.3 测试任务

1. 多市场数据验证（A股/港股/美股）
2. 排序和筛选功能测试
3. 定时任务测试
4. 边界情况测试

## 10. 后续扩展 (Phase 2)

- **实时行情**: WebSocket 推送或短轮询
- **迷你分时图**: sparkline 显示日内走势
- **异动检测**: 价格/成交量异常检测和通知
- **AI 分析**: 异动原因分析、风险评估
- **公告摘要**: 智能摘要重要公告
- **更多技术指标**: MACD、KDJ、RSI 等
- **多股同列**: 对比视图
- **回测功能**: 基于 watchlist_quote_history 的策略回测

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
