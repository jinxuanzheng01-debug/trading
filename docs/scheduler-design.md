# 定时任务系统设计

## 架构总览

```
yfinance ──┐         ┌──────────────────┐     ┌──────────────┐
           ├─────────►  market-data:8000 │◄────│  scheduler   │
AkShare ───┘         │  (数据代理)       │     │  :8001       │
                      └────────┬─────────┘     └──────┬───────┘
                               │                      │
                               │ 拉取外部数据           │ 写入 PG
                               ▼                      ▼
                      ┌──────────────────────────────────┐
                      │         PostgreSQL               │
                      │  stocks / klines / stock_quotes  │
                      │  quote_snapshots / stock_fundamentals │
                      └──────────────────────────────────┘
```

**核心原则**：所有 API 读 PG，不穿透外部数据源。数据入库由 scheduler 定时任务负责，基于 `stocks` 表全量同步。

---

## 1. 数据源客户端

数据获取由 **market-data 服务 (端口 8000)** 封装，scheduler 不直连 yfinance/AkShare：

| 客户端 | 文件 | 覆盖市场 | 数据能力 |
|--------|------|----------|----------|
| `YFinanceClient` | `services/market-data/app/services/yfinance_client.py` | 美股、港股 | 报价、日/周/月 K线、基本面 |
| `AkShareClient` | `services/market-data/app/services/akshare_client.py` | A股、港股 | 报价、日/周/月 K线 |

路由选择：优先 AkShare（A股/港股），其余走 yfinance（美股）。

> market-data 无 Redis 缓存，所有请求直连外部数据源。

---

## 2. 定时任务一览

定义在 `services/scheduler/app/main.py`，基于 **APScheduler** (AsyncIOScheduler)：

| # | 任务函数 | Cron | 市场过滤 | 操作 |
|---|---------|------|----------|------|
| 1 | `sync_all_stock_klines` | `0 6 * * *` | 全量 | 查本地最新日期 → 增量/全量拉日线 |
| 2 | `sync_cn_quotes` | `35 15 * * *` | A股 (6位数字) | 批量拉报价 |
| 3 | `sync_hk_quotes` | `35 16 * * *` | 港股 (≤5位数字) | 批量拉报价 |
| 4 | `sync_us_quotes` | `35 4 * * *` | 美股 (其余) | 批量拉报价 |
| 5 | `sync_us_fundamentals` | `0 5 * * *` | 仅美股 | 拉 PE/EPS/市值 |

启动时还会自动调用 `seed_if_empty()` 检测 klines 表为空则全量 seed。

---

## 3. K线同步机制

代码在 `services/scheduler/app/jobs/sync_kline.py`。

### 3.1 定时增量同步 (`sync_all_stock_klines`)

```
1. 从 backend API 获取 stocks 表中所有股票代码
       ↓
2. 逐只处理（间隔 2 秒控频）
       ↓
3. 查本地最新K线日期 → backend API: /api/internal/klines/latest
       ↓
   ├─ 有本地数据 → 增量：从 latest_date + 1 天起
   │   调用 market-data: /api/kline?symbol=X&interval=1d&start=YYYY-MM-DD
   │
   └─ 无本地数据 → 全量：从 1990-01-01 起
       调用 market-data: /api/kline?symbol=X&interval=1d&start=1990-01-01
       ↓
4. 写入 PG → backend API: POST /api/internal/klines/sync (UPSERT)
```

关键设计：
- **只存日线**，周/月线由 SQL `date_trunc` 聚合派生
- **增量优先**：从 latest_date + 1 天开始拉，无新数据自然跳过
- **无过期阈值**：直接基于库内最新日期判断

### 3.2 启动自检全量 Seed (`seed_if_empty`)

scheduler 启动时自动调用，检测 klines 表为空则全量同步：50 只一批，调用 `/api/kline/batch` → 逐只写入 PG。

---

## 4. 报价同步机制

代码在 `services/scheduler/app/jobs/sync_stock_quotes.py`。

`sync_stock_quotes(market)` 按 symbol 格式过滤后拉取：

```
1. 从 stocks 表获取所有股票代码
       ↓
2. 按 market 参数过滤（CN/HK/US）
       ↓
3. 20 只一批 → market-data: /api/quotes
       ↓
4. 写入 PG → backend API: POST /api/internal/quotes/sync
   - stock_quotes: UPSERT
   - quote_snapshots: APPEND
```

三个 cron 任务各负责一个市场，避免重复拉取。

---

## 5. 基本面同步机制

代码在 `services/scheduler/app/jobs/sync_fundamentals.py`。

```
1. 从 stocks 表获取所有股票代码，过滤仅保留美股
       ↓
2. 5 只一批 → backend API: POST /api/internal/fundamentals/sync
       ↓
3. Backend API 内部调 yfinance 获取 PE/EPS/市值
       ↓
4. 写入 stock_fundamentals 表 (UPSERT)
```

- 只存最新快照，不存时序
- 仅同步美股——yfinance 对 A 股/港股无可靠基本面数据

---

## 6. 市场判断规则

定义在 `backend_api.py`，与 AkShare 逻辑一致：

```python
is_a_stock(s) → s.isdigit() and len(s) == 6     # 000001, 600519
is_hk_stock(s) → s.isdigit() and len(s) <= 5     # 0700
is_us_stock(s) → not (a or hk)                   # AAPL, 0700.HK
```

> 港股 yfinance 格式 `0700.HK` 会被归为美股（含 `.` 非纯数字），数据源路由由 market-data 的 `supports_market()` 处理。

---

## 7. 数据流向总结

| 数据种类 | 外部源 | 拉取路径 | 写入表 | 写入方式 |
|----------|--------|----------|--------|----------|
| K线(日线) | yfinance / AkShare | scheduler → market-data → PG | `klines` | UPSERT |
| 实时报价 | yfinance / AkShare | scheduler → market-data → PG | `stock_quotes` + `quote_snapshots` | UPSERT + APPEND |
| 基本面 | yfinance | scheduler → backend API → market-data → yfinance | `stock_fundamentals` | UPSERT |

---

## 8. 已移除的模块

| 模块 | 移除原因 |
|------|----------|
| Redis Streams 事件消费 | 同步基于 stocks 全量，不再需要 watchlist 触发 |
| `sync_single_symbol_klines` | 已无调用方 |
| `/webhook/watchlist/added` | 废弃接口 |
| `redis_client.py` | Stream 链路完整移除 |
| market-data Redis 缓存 | 无高频读场景 |
| STALE_HOURS 阈值 | 库内最新日期已能自然防重 |

---

## 9. 相关文件索引

```
services/scheduler/
├── app/
│   ├── main.py                          # 入口：注册 5 个定时任务 + seed_if_empty
│   ├── config.py                        # 配置（API地址、服务token）
│   ├── clients/
│   │   ├── backend_api.py               # 写 PG 入口（K线、报价、基本面）+ 市场判断
│   │   └── data_api.py                  # 从 market-data 拉数据
│   └── jobs/
│       ├── sync_kline.py                # K线同步
│       ├── sync_stock_quotes.py         # 报价同步（按市场过滤）
│       └── sync_fundamentals.py         # 基本面同步（仅美股）

services/market-data/
├── app/
│   ├── api/routes.py                    # API 路由（/kline, /quotes, /batch）
│   └── services/
│       ├── yfinance_client.py           # yfinance 数据源
│       └── akshare_client.py            # AkShare 数据源
```
