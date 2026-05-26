# 自选股功能设计文档

**日期**: 2026-05-26
**版本**: MVP v1.0
**状态**: 设计已完成，待实施

## 1. 概述

### 1.1 项目背景

Trading Agent 是一个面向散户投资者的 AI 辅助量化分析平台。当前项目已完成基础的 Watchlist CRUD 功能（分组和标的的管理），但尚未集成市场数据。本设计旨在实现一个参考长桥/富途、具备差异化竞争力的自选股功能。

### 1.2 目标

构建一个支持多市场（A股/港股/美股）的自选股系统，提供实时行情展示、智能监控和排序筛选功能。采用分层混合架构，为后续 AI 分析功能预留扩展空间。

### 1.3 MVP 范围

**包含功能：**
- 实时报价/涨跌幅/成交量显示（2-5秒刷新）
- 迷你分时图 sparkline
- 排序和筛选（价格/涨跌幅/成交量）
- 规则式异动检测（价格/成交量异常）
- 多市场支持，统一数据刷新策略

**暂不包含（Phase 2）：**
- AI 分析（异动原因分析、风险评估）
- 公告摘要
- WebSocket 实时推送

## 2. 系统架构

### 2.1 架构图

```
┌─────────────────────────────────────────────────────────────┐
│                         前端层                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ 自选股列表页  │  │  标的详情页   │  │ 异动提示组件  │      │
│  │  (轮询刷新)   │  │  (按需加载)   │  │  (低频轮询)   │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
└─────────┼──────────────────┼──────────────────┼─────────────┘
          │                  │                  │
┌─────────┼──────────────────┼──────────────────┼─────────────┐
│         ▼                  ▼                  ▼              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                    后端 API 层                        │    │
│  │  api/business (Hono + PostgreSQL)                    │    │
│  │                                                       │    │
│  │  GET /api/watchlist/groups/:id/quotes  (聚合)        │    │
│  │  GET /api/watchlist/alerts             (查询)        │    │
│  │  PUT  /api/watchlist/groups/:id/reorder (排序)       │    │
│  └───────────────────────┬─────────────────────────────┘    │
│                           │                                  │
│         ┌─────────────────┴─────────────────┐              │
│         ▼                                   ▼              │
│  ┌──────────────┐                   ┌──────────────┐      │
│  │ 数据服务层    │                   │ 后台任务层    │      │
│  │ market-data  │                   │ 定时扫描      │      │
│  │ (FastAPI)    │                   │ 异动检测      │      │
│  │              │                   │ 存入数据库    │      │
│  └──────────────┘                   └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 数据流

**列表数据流：**
```
前端 → GET /api/watchlist/groups/:id/quotes
     → 后端调用 market-data/quotes (批量)
     → 聚合数据返回前端
     → 每 2-5 秒自动刷新
```

**异动数据流：**
```
后台任务 (每 1-2 分钟)
     → 扫描活跃分组
     → 规则检测 (价格/成交量)
     → 存入 watchlist_alerts 表
     ← 前端查询 /api/watchlist/alerts
     ← 每 10-30 秒轮询
```

## 3. 数据库设计

### 3.1 新增表：watchlist_alerts

```sql
CREATE TABLE watchlist_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES watchlist_groups(id) ON DELETE CASCADE,
  symbol VARCHAR(50) NOT NULL,
  alert_type VARCHAR(20) NOT NULL,  -- 'price_movement', 'volume_spike'
  severity VARCHAR(10) NOT NULL,     -- 'info', 'warning', 'critical'
  title VARCHAR(200) NOT NULL,
  content TEXT,                      -- 预留 AI 分析内容
  metadata JSONB,                    -- 原始数据
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

CREATE INDEX idx_alerts_group_symbol ON watchlist_alerts(group_id, symbol);
CREATE INDEX idx_alerts_created_at ON watchlist_alerts(created_at DESC);
```

### 3.2 修改现有表：watchlist_items

```sql
ALTER TABLE watchlist_items ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
```

### 3.3 数据保留策略

- 异动检测数据：保留 24 小时
- 定时清理任务：每天凌晨 2 点执行

## 4. API 接口设计

### 4.1 自选股行情聚合接口

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
      "symbol": "AAPL",
      "name": "Apple Inc.",
      "type": "stock",
      "exchange": "NASDAQ",
      "price": 178.52,
      "change": 2.35,
      "changePercent": 1.33,
      "volume": 52340000,
      "marketCap": 2780000000000,
      "lastUpdate": "2026-05-26T10:30:00Z"
    }
  ],
  "summary": {
    "total": 12,
    "up": 7,
    "down": 4,
    "flat": 1
  },
  "lastUpdate": "2026-05-26T10:30:00Z"
}
```

### 4.2 异动接口

```
GET /api/watchlist/alerts?groupId=xxx
```

**响应：**
```json
{
  "alerts": [
    {
      "id": "uuid",
      "type": "price_movement",
      "severity": "warning",
      "title": "AAPL 5 分钟内下跌 3.12%",
      "symbol": "AAPL",
      "metadata": {
        "fromPrice": 182.50,
        "toPrice": 176.80,
        "changePercent": -3.12,
        "timeWindow": "5m"
      },
      "createdAt": "2026-05-26T10:28:00Z"
    }
  ]
}
```

### 4.3 排序接口

```
PUT /api/watchlist/groups/:groupId/reorder
Content-Type: application/json

{
  "itemIds": ["uuid1", "uuid2", "uuid3"]
}
```

### 4.4 market-data 新增接口

```
GET /api/quotes/mini-chart?symbols=AAPL,TSLA&period=1d
```

**响应：**
```json
{
  "miniCharts": {
    "AAPL": [[1716739200000, 178.1], [1716739260000, 178.3], ...],
    "TSLA": [[1716739200000, 175.2], [1716739260000, 175.5], ...]
  }
}
```

## 5. 前端组件设计

### 5.1 页面结构

```
pages/watchlist/index.vue
├── WatchlistSidebar      (分组列表)
├── WatchlistToolbar      (工具栏：排序/筛选/刷新)
├── WatchlistTable        (数据表格)
│   ├── SymbolColumn      (代码+名称+类型标签)
│   ├── PriceColumn       (价格+涨跌幅+迷你图)
│   ├── VolumeColumn      (成交量)
│   └── ActionsColumn     (操作)
└── WatchlistAlertsPanel  (异动提示抽屉)
```

### 5.2 新增功能

| 功能 | 说明 |
|------|------|
| 点击列标题排序 | 价格/涨跌幅/成交量，支持升序/降序 |
| 自动刷新 | 2-5 秒轮询，可暂停 |
| 价格闪烁 | 红色/绿色闪烁指示变动方向 |
| 迷你分时图 | SVG sparkline 显示日内走势 |
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

## 6. 异动检测规则

### 6.1 价格异动

| 类型 | 条件 | 严重级别 |
|------|------|----------|
| 短期暴涨 | 5 分钟内涨幅 > 5% | warning |
| 短期暴跌 | 5 分钟内跌幅 > 5% | warning |
| 日内异动 | 当前涨跌幅 > ±8% | critical |

### 6.2 成交量异动

| 类型 | 条件 | 严重级别 |
|------|------|----------|
| 量比异常 | 当前成交量 / 过去5日平均 > 3 | info |

### 6.3 后台任务调度

| 任务 | 频率 | 说明 |
|------|------|------|
| 高频扫描 | 每 1-2 分钟 | 扫描活跃分组（最近有查看） |
| 低频扫描 | 每 15 分钟 | 扫描所有分组 |

## 7. 错误处理

### 7.1 数据获取失败

| 场景 | 处理方式 |
|------|----------|
| market-data 不可用 | 显示 "数据暂时无法获取"，保留缓存 |
| 单个标的失败 | 显示 "--" 或 "N/A" |
| 网络断开 | 显示离线提示，暂停轮询 |

### 7.2 空状态处理

| 场景 | 处理方式 |
|------|----------|
| 空分组 | 显示引导 UI："点击 + 添加股票" |
| 无数据 | 显示 loading 骨架屏 |

### 7.3 数据过期提示

| 场景 | 处理方式 |
|------|----------|
| 数据超时 30 秒 | 时间戳显示橙色 |
| 正常更新 | 时间戳显示灰色 |

## 8. 性能优化

### 8.1 前端优化

- **虚拟滚动**: 自选股 > 50 只时启用
- **图表缓存**: 迷你分时图数据缓存 30 秒
- **轮询暂停**: 页面隐藏时暂停轮询

### 8.2 后端优化

- **Redis 缓存**: 聚合数据缓存 5 秒，异动数据缓存 30 秒
- **请求合并**: market-data 批量接口一次性获取所有标的

### 8.3 并发处理

- **前端**: 轮询防抖，新请求取消旧请求
- **后端**: 同一分组的并发请求合并为一次 market-data 调用

## 9. 实施计划

### 9.1 后端任务

1. 数据库迁移（新增表、修改表）
2. market-data 新增批量迷你图接口
3. api/business 新增聚合接口
4. 后台异动检测任务
5. 单元测试

### 9.2 前端任务

1. 扩展 watchlist 页面组件
2. 实现排序/筛选功能
3. 迷你分时图组件
4. 异动提示面板
5. 自动刷新逻辑

### 9.3 集成测试

1. 端到端测试
2. 性能测试
3. 多市场数据验证

## 10. 后续扩展 (Phase 2)

- AI 分析：异动原因分析、风险评估
- 公告摘要：智能摘要重要公告
- WebSocket 实时推送：替代轮询
- 更多技术指标：MACD、KDJ 等
- 多股同列对比视图

## 11. 附录

### 11.1 参考文档

- 长桥自选股功能: https://longbridge.com
- 富途/Moomoo 自选股: https://www.moomoo.com
- core-infra 规格: `/Users/xuan/Documents/xuan/core-infra`

### 11.2 变更历史

| 日期 | 版本 | 变更内容 |
|------|------|----------|
| 2026-05-26 | v1.0 | 初始设计，MVP 版本 |
