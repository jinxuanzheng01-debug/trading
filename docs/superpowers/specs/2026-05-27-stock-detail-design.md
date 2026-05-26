# 个股详情页设计文档

**日期**: 2026-05-27
**版本**: v1.0
**状态**: 设计中

## 1. 概述

将当前的 StockDetailDialog 弹窗升级为独立的全屏个股详情页，路由 `/stock/[symbol]`。参考富途/长桥的个股页设计，提供K线图表、关键指标、公司概况等全面信息。

## 2. 路由设计

```
/stock/[symbol]          → 个股详情页（server-side 或 client-side）
/stock/[symbol]?interval=1d&period=1y
```

从自选股列表点击股票 → `navigateTo(/stock/${symbol})` 跳转。

## 3. 页面布局

```
┌─────────────────────────────────────────────────────┐
│  ← 返回    AAPL - Apple Inc.          ★ 加入自选    │
├─────────────────────────────────────────────────────┤
│  $310.12     +1.62 (+0.52%)                         │
│  今开 309.40  最高 311.82  最低 309.35              │
│  昨收 308.40  成交量 19.9M   市值 4.55T             │
├─────────────────────────────────────────────────────┤
│  [1d] [1w] [1M] [3M] [6M] [1y] [5y]  时间范围选择   │
│                                                     │
│  ┌─────────────────────────────────────────────┐    │
│  │                                             │    │
│  │          lightweight-charts K线图            │    │
│  │                                             │    │
│  │                                             │    │
│  └─────────────────────────────────────────────┘    │
│          成交量柱状图                                │
├─────────────────────────────────────────────────────┤
│  [概览] [财务] [新闻]                               │
├─────────────────────────────────────────────────────┤
│  概览 Tab:                                          │
│  ┌────────────┬────────────┬────────────┐           │
│  │ 市盈率 P/E  │ 市净率 P/B  │ 每股收益    │           │
│  │ 52周高      │ 52周低      │ 股息率      │           │
│  │ 平均成交量   │ Beta       │ 流通股本    │           │
│  └────────────┴────────────┴────────────┘           │
│                                                     │
│  财务 Tab:                                           │
│  ┌────────────┬────────────┬────────────┐           │
│  │ 总收入      │ 净利润      │ 毛利率      │           │
│  │ 营收增长    │ 利润增长    │ 资产负债率  │           │
│  └────────────┴────────────┴────────────┘           │
└─────────────────────────────────────────────────────┘
```

## 4. 数据来源

### 4.1 yfinance 能提供的数据

| 类别 | 字段 | 来源 |
|------|------|------|
| 报价 | price/change/changePercent/volume/high/low/open/prevClose | fast_info |
| 公司信息 | longName/sector/industry/website/country | ticker.info |
| 关键指标 | marketCap/trailingPE/forwardPE/priceToBook/beta | ticker.info |
| 52周 | fiftyTwoWeekHigh/fiftyTwoWeekLow | ticker.info |
| 股息 | dividendRate/dividendYield | ticker.info |
| 财务 | totalRevenue/netIncome/grossMargins | ticker.financials |
| K线 | OHLCV 历史 | ticker.history() |

### 4.2 新增 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/stock/:symbol | 个股综合信息（报价+公司+指标） |
| GET | /api/stock/:symbol/kline?interval=1d&period=1y | K线数据 |
| GET | /api/stock/:symbol/financials | 财务报表摘要 |

## 5. 数据库

个股详情页不新增表。数据直接走 market-data → yfinance 实时获取，缓存到 Redis（TTL 5分钟）。

## 6. 前端组件

```
pages/stock/[symbol].vue
├── StockHeader       (股票名/价格/涨跌幅/OHLC/加入自选)
├── StockChart        (lightweight-charts K线 + 成交量 + 区间切换)
├── StockTabs         (概览 / 财务 / 新闻)
│   ├── StockOverview (关键指标卡片)
│   └── StockFinancials (营收/利润/增长表格)
└── StockWatchlistBtn (加入/移出自选，复用 useWatchlist)
```

## 7. K线图表增强

- 支持 MA5/MA10/MA20/MA60 均线叠加
- 成交量柱状图（红涨绿跌）
- 区间切换：1d / 1w / 1M / 3M / 6M / 1y / 5y
- 十字光标显示 OHLC 数据
- 响应式：移动端缩略图，桌面端全尺寸

## 8. 实施范围

- P0: 独立页面 + 报价头 + K线图（区间切换）
- P1: 关键指标卡片 + 概览Tab
- P2: 财务Tab + 新闻Tab

## 9. 与现有 StockDetailDialog 的关系

StockDetailDialog → 废弃，统一用 `/stock/[symbol]` 页面。自选股列表点击 → navigateTo 跳转。
