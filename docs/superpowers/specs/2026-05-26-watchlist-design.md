# 自选股功能设计文档

**日期**: 2026-05-26
**版本**: MVP v1.2 (极简版)
**状态**: 设计已完成，待实施

## 1. 概述

### 1.1 项目背景

Trading Agent 是一个面向散户投资者的 AI 辅助量化分析平台。当前项目已完成基础的 Watchlist CRUD 功能（分组和标的的管理），但尚未集成市场数据。本设计旨在实现一个参考长桥/富途、具备差异化竞争力的自选股功能。

### 1.2 目标

构建一个支持多市场（A股/港股/美股）的自选股系统，提供 T+1 行情展示、排序筛选功能。采用直接调用 market-data 服务的简化架构。

### 1.3 MVP 范围

**包含功能：**
- T+1 行情展示（昨收盘价、涨跌幅、成交量）
- 排序和筛选（价格/涨跌幅/成交量）
- 多市场支持，统一数据策略

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
│  │    → 调用 market-data/quotes (批量)                   │    │
│  │    → 聚合返回数据                                     │    │
│  │                                                       │    │
│  │  GET /api/watchlist/groups/:id/items                 │    │
│  │    → 查询 watchlist_items 表                          │    │
│  │    → 调用 market-data/quotes 填充行情数据              │    │
│  └─────────────────────────────────────────────────────┘    │
│                           │                                  │
│                           ▼                                  │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                    数据服务层                          │    │
│  │  market-data (FastAPI + Redis 缓存)                   │    │
│  │                                                       │    │
│  │  GET /api/quotes?symbols=AAPL,TSLA,...               │    │
│  │  GET /api/quote?symbol=AAPL                          │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 数据流

**查询自选股列表行情：**
```
前端 → GET /api/watchlist/groups/:id/quotes
     → 后端查询 watchlist_items 表获取标的列表
     → 调用 market-data/quotes?symbols=AAPL,TSLA,...
     → 聚合数据返回前端
```

**添加新标的：**
```
前端 → POST /api/watchlist/groups/:id/items
     → 后端保存到 watchlist_items 表
     → 调用 market-data/quote 验证标的并获取基础信息
     → 返回结果
```

**数据缓存：**
- market-data 服务内部已有 Redis 缓存
- T+1 数据 TTL 可延长到 1-2 小时
- 无需额外的缓存层

## 3. 数据库设计

### 3.1 修改现有表：watchlist_items

```sql
-- 添加排序字段
ALTER TABLE watchlist_items ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

-- 添加市场字段（如果还没有）
ALTER TABLE watchlist_items ADD COLUMN IF NOT EXISTS market VARCHAR(20);
-- 市场值: 'CN' (A股), 'US' (美股), 'HK' (港股)
```

**现有字段复用：**
- `symbol` - 股票代码
- `name` - 股票名称
- `type` - 类型 (stock/etf/index/crypto)
- `exchange` - 交易所

**无需新增缓存表** - 直接调用 market-data 服务获取行情数据。

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

### 4.3 现有接口调整

**获取分组下的标的（增强）：**
```
GET /api/watchlist/groups/:id/items
```

增强：返回时附带最新的行情数据（调用 market-data）。

## 5. 前端组件设计

### 5.1 页面结构

```
pages/watchlist/index.vue
├── WatchlistSidebar      (分组列表)
├── WatchlistToolbar      (工具栏：排序/筛选)
├── WatchlistTable        (数据表格)
│   ├── SymbolColumn      (代码+名称+类型标签)
│   ├── PriceColumn       (价格+涨跌幅)
│   ├── VolumeColumn      (成交量)
│   └── ActionsColumn     (操作)
└── StockDetailDialog     (标的详情弹窗)
```

### 5.2 新增功能

| 功能 | 说明 |
|------|------|
| 点击列标题排序 | 价格/涨跌幅/成交量，支持升序/降序 |
| 拖拽排序 | 手动拖拽调整顺序 |
| 筛选器 | 按类型/涨跌幅/市场筛选 |

### 5.3 排序选项

- 默认（用户自定义 sort_order）
- 价格（高→低 / 低→高）
- 涨跌幅（高→低 / 低→高）
- 成交量（高→低）

### 5.4 筛选器

- 按类型：股票 / ETF / 指数 / 加密货币
- 按涨跌幅：涨幅>5% / 跌幅>5% / 平盘
- 按市场：A股 / 港股 / 美股

### 5.5 数据展示

| 字段 | 说明 | 示例 |
|------|------|------|
| 价格 | 最新收盘价 | 178.52 |
| 涨跌额 | 较前一交易日 | +2.35 |
| 涨跌幅 | 较前一交易日百分比 | +1.33% |
| 成交量 | 成交量 | 52,340,000 |
| 数据日期 | 显示是哪天的数据 | 05-23 |

## 6. 错误处理

### 6.1 数据获取失败

| 场景 | 处理方式 |
|------|----------|
| market-data 不可用 | 显示 "数据暂时无法获取"，显示标的代码和名称 |
| 单个标的失败 | 显示行情数据为 "--"，其他标的正常显示 |
| 网络超时 | 显示 "加载超时，请重试" |

### 6.2 空状态处理

| 场景 | 处理方式 |
|------|----------|
| 空分组 | 显示引导 UI："点击 + 添加股票到自选" |
| 无数据 | 显示空状态插图 |

## 7. 性能考虑

### 7.1 前端优化

- **虚拟滚动**: 自选股 > 50 只时启用
- **分页加载**: 默认显示 50 条

### 7.2 后端优化

- **market-data 批量接口**: 一次请求获取多个标的
- **Redis 缓存**: market-data 内部已有缓存（TTL 延长到 1-2 小时）

### 7.3 数据加载

- **首次加载**: 显示 loading 骨架屏
- **后续加载**: 使用缓存数据，响应快速

## 8. 实施计划

### 8.1 后端任务

1. **数据库迁移**
   - 添加 `sort_order` 字段到 `watchlist_items`
   - 添加 `market` 字段到 `watchlist_items`

2. **新增 API 接口** (`api/business`)
   - `GET /api/watchlist/groups/:id/quotes`
   - `PUT /api/watchlist/groups/:id/reorder`

3. **增强现有接口**
   - `GET /api/watchlist/groups/:id/items` 附带行情数据

4. **market-data 服务调整**
   - 延长 Redis TTL 到 1-2 小时（T+1 数据）

### 8.2 前端任务

1. **扩展 watchlist 页面**
   - 调用新的 `/quotes` 接口
   - 显示行情数据

2. **实现排序功能**
   - 点击列标题排序
   - 拖拽排序

3. **实现筛选功能**
   - 类型/涨跌幅/市场筛选

4. **样式优化**
   - 涨跌幅颜色（红涨绿跌 / 绿涨红跌可配置）

### 8.3 测试任务

1. 多市场数据验证（A股/港股/美股）
2. 排序和筛选功能测试
3. 边界情况测试（空分组、服务不可用）

## 9. 后续扩展 (Phase 2)

- **实时行情**: WebSocket 推送或短轮询
- **迷你分时图**: sparkline 显示日内走势
- **异动检测**: 价格/成交量异常检测和通知
- **AI 分析**: 异动原因分析、风险评估
- **公告摘要**: 智能摘要重要公告
- **更多技术指标**: MACD、KDJ、RSI 等
- **多股同列**: 对比视图

## 10. 附录

### 10.1 参考文档

- 长桥自选股功能: https://longbridge.com
- 富途/Moomoo 自选股: https://www.moomoo.com
- core-infra 规格: `/Users/xuan/Documents/xuan/core-infra`

### 10.2 变更历史

| 日期 | 版本 | 变更内容 |
|------|------|----------|
| 2026-05-26 | v1.0 | 初始设计，包含实时行情和异动检测 |
| 2026-05-26 | v1.1 | 简化为 T+1 数据，增加缓存表和定时任务 |
| 2026-05-26 | v1.2 | 极简版：去除缓存表，直接调用 market-data |
