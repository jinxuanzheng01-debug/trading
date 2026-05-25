# 市场数据服务设计文档

**版本**: v0.1
**日期**: 2026-05-20
**状态**: 草稿

## 一、概述

### 1.1 目标

构建独立的市场数据服务，为前端和后端 API 提供统一的行情数据接口。

### 1.2 职责

- 从数据源获取实时行情和历史 K线数据
- 计算常用技术指标
- 提供 HTTP API 接口
- 通过 Redis 缓存减少外部请求
- 将 K线数据持久化到 TimescaleDB（T+1 策略）

### 1.3 数据源

| 市场 | 数据源 | 状态 |
|------|--------|------|
| 美股 | yfinance | ✅ 免费 |
| A股 | AkShare | ✅ 免费 |
| 港股 | yfinance | ✅ 免费 |

### 1.4 扩展性

预留数据源扩展接口，后续可按需接入：
- 腾讯行情数据
- mootdx（财经数据）
- Tushare（付费，更稳定）
- BaoStock（兜底）

### 1.5 不负责

- 用户认证（由 Hono 后端处理）
- 数据推送（WebSocket 后续再考虑）
- 回测逻辑（独立服务）

---

## 二、架构设计

### 2.1 服务架构

```
┌───────────────────────────────────────────────────────────────────┐
│                          前端 (Nuxt 4)                           │
│                      - 自选列表、K线图表                          │
└─────────────────────────────┬─────────────────────────────────────┘
                              │ HTTP
                              ▼
┌───────────────────────────────────────────────────────────────────┐
│                     后端 API (Hono) - 端口 3002                   │
│                     - 认证中间件、业务逻辑路由                     │
└───────────────────┬───────────────────┬───────────────────────────┘
                    │                   │
                    ▼                   ▼
┌───────────────────────────────┐  ┌───────────────────────────────┐
│   数据服务 (FastAPI) - 8000   │  │   定时任务服务 - 8001        │
│  ┌─────────┐  ┌─────────┐     │  │  ┌─────────────────────────┐ │
│  │ API路由 │  │指标计算 │     │  │  │ K线同步 (每天凌晨2点)   │ │
│  │缓存管理 │  │DB读写   │     │  │  │ 价格提醒扫描 (每分钟)   │ │
│  └─────────┘  └─────────┘     │  │  │ AI市场雷达 (每小时)     │ │
└───────────┬───────────────────┘  │  │ AI宏观日报 (每天早上)    │ │
            │                      │  └─────────────────────────┘ │
            │                      └───────────┬───────────────────┘
            │                                  │
    ┌───────┴────────┐              ┌───────────┴────────┐
    ▼                ▼              ▼                     ▼
┌─────────┐   ┌──────────┐   ┌──────────┐        ┌─────────────┐
│yfinance │   │  Redis   │   │TimescaleDB│       │   后端API   │
│(外部数据)│   │  (缓存)  │   │ (K线存储) │       │ (获取自选)  │
└─────────┘   └──────────┘   └───────────┘        └─────────────┘
```

### 2.2 目录结构

**数据服务 (services/market-data/)**:
```
services/market-data/
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPI 应用入口
│   ├── config.py            # 配置管理
│   ├── api/
│   │   ├── __init__.py
│   │   ├── routes.py         # API 路由
│   │   └── models.py         # 请求/响应模型
│   ├── services/
│   │   ├── __init__.py
│   │   ├── base_client.py       # 数据源基类（预留扩展）
│   │   ├── yfinance_client.py   # yfinance 客户端（美股/港股）
│   │   ├── akshare_client.py    # AkShare 客户端（A股）
│   │   ├── indicators.py        # 技术指标计算
│   │   └── cache.py             # Redis 缓存管理
│   └── db/
│       ├── __init__.py
│       ├── connection.py         # TimescaleDB 连接
│       └── models.py             # SQLAlchemy 模型
├── requirements.txt
├── Dockerfile
└── pyproject.toml
```

**定时任务服务 (services/scheduler/)**:
```
services/scheduler/
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPI 应用入口（用于健康检查）
│   ├── config.py            # 配置管理
│   ├── jobs/
│   │   ├── __init__.py
│   │   ├── sync_kline.py         # K线同步任务
│   │   ├── price_alert.py        # 价格提醒扫描
│   │   ├── market_radar.py       # AI市场雷达（后续）
│   │   └── daily_report.py       # AI宏观日报（后续）
│   ├── clients/
│   │   ├── __init__.py
│   │   ├── backend_api.py        # 调用后端API获取自选列表
│   │   └── data_api.py           # 调用数据服务API
│   └── utils/
│       ├── __init__.py
│       └── logger.py             # 日志记录
├── requirements.txt
├── Dockerfile
└── pyproject.toml
```

---

## 三、API 接口设计

### 3.1 基础信息

- **Base URL**: `http://localhost:8000`
- **响应格式**: JSON
- **字符编码**: UTF-8

### 3.2 接口列表

#### 3.2.1 获取单个标的实时行情

```http
GET /api/quote?symbol=AAPL
```

**请求参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| symbol | string | 是 | 标的代码，如 AAPL、000001.SZ、0700.HK |

**响应示例**:
```json
{
  "symbol": "AAPL",
  "name": "Apple Inc.",
  "price": 178.50,
  "change": 2.30,
  "changePercent": 1.30,
  "volume": 52340000,
  "high": 179.20,
  "low": 176.80,
  "open": 177.00,
  "previousClose": 176.20,
  "marketCap": 2780000000000,
  "currency": "USD",
  "timestamp": "2026-05-20T20:00:00Z"
}
```

#### 3.2.2 批量获取行情

```http
GET /api/quotes?symbols=AAPL,TSLA,000001.SZ
```

**请求参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| symbols | string | 是 | 逗号分隔的标的代码，最多 50 个 |

**响应示例**:
```json
{
  "data": [
    {
      "symbol": "AAPL",
      "price": 178.50,
      "change": 2.30,
      "changePercent": 1.30
    },
    {
      "symbol": "TSLA",
      "price": 245.80,
      "change": -5.20,
      "changePercent": -2.07
    }
  ],
  "timestamp": "2026-05-20T20:00:00Z"
}
```

#### 3.2.3 获取 K线数据

```http
GET /api/kline?symbol=AAPL&interval=1d&limit=100
```

**请求参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| symbol | string | 是 | 标的代码 |
| interval | string | 否 | 时间周期，默认 1d。支持: 1m, 5m, 15m, 30m, 1h, 4h, 1d, 1w |
| limit | number | 否 | 返回数量，默认 100，最大 500 |
| startDate | string | 否 | 开始日期，格式 YYYY-MM-DD |
| endDate | string | 否 | 结束日期，格式 YYYY-MM-DD |

**响应示例**:
```json
{
  "symbol": "AAPL",
  "interval": "1d",
  "data": [
    {
      "time": "2026-05-01T00:00:00Z",
      "open": 175.20,
      "high": 178.50,
      "low": 174.80,
      "close": 177.90,
      "volume": 52340000
    },
    {
      "time": "2026-05-02T00:00:00Z",
      "open": 177.50,
      "high": 179.20,
      "low": 176.90,
      "close": 178.50,
      "volume": 48560000
    }
  ]
}
```

#### 3.2.4 获取技术指标

```http
GET /api/indicators?symbol=AAPL&indicators=MA,EMA,MACD,RSI,KDJ,BB
```

**请求参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| symbol | string | 是 | 标的代码 |
| indicators | string | 是 | 逗号分隔的指标名称 |
| interval | string | 否 | 时间周期，默认 1d |
| period | number | 否 | 数据周期数，默认 100 |

**响应示例**:
```json
{
  "symbol": "AAPL",
  "interval": "1d",
  "indicators": {
    "MA": {
      "MA5": 178.20,
      "MA10": 177.50,
      "MA20": 176.80,
      "MA60": 175.30
    },
    "EMA": {
      "EMA12": 178.10,
      "EMA26": 177.20
    },
    "MACD": {
      "MACD": 0.90,
      "Signal": 0.75,
      "Histogram": 0.15
    },
    "RSI": {
      "RSI6": 65.20,
      "RSI12": 58.40,
      "RSI24": 52.10
    },
    "KDJ": {
      "K": 75.20,
      "D": 70.50,
      "J": 84.60
    },
    "BB": {
      "upper": 180.50,
      "middle": 177.00,
      "lower": 173.50,
      "bandwidth": 1.97
    }
  }
}
```

#### 3.2.5 健康检查

```http
GET /health
```

**响应示例**:
```json
{
  "status": "ok",
  "timestamp": "2026-05-20T20:00:00Z"
}
```

### 3.3 错误响应

```json
{
  "error": "Invalid symbol",
  "code": "INVALID_SYMBOL",
  "message": "Symbol 'INVALID' not found"
}
```

---

## 四、数据库设计

### 4.1 TimescaleDB 表结构

#### 4.1.1 K线数据表 (ohlcv)

```sql
-- 创建 K线数据表
CREATE TABLE IF NOT EXISTS ohlcv (
    time TIMESTAMPTZ NOT NULL,
    symbol VARCHAR(50) NOT NULL,
    interval VARCHAR(10) NOT NULL,  -- 1m, 5m, 15m, 30m, 1h, 4h, 1d, 1w
    open DECIMAL(20, 8) NOT NULL,
    high DECIMAL(20, 8) NOT NULL,
    low DECIMAL(20, 8) NOT NULL,
    close DECIMAL(20, 8) NOT NULL,
    volume BIGINT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (time, symbol, interval)
);

-- 转换为超表（自动按时间分区）
SELECT create_hypertable('ohlcv', 'time', if_not_exists => TRUE);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_ohlcv_symbol_time ON ohlcv(symbol, time DESC);
CREATE INDEX IF NOT EXISTS idx_ohlcv_symbol_interval ON ohlcv(symbol, interval, time DESC);

-- 启用压缩（7天前的数据自动压缩）
ALTER TABLE ohlcv SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'symbol',
    timescaledb.compress_orderby = 'time'
);
ADD compression policy ohlcv INTERVAL '7 days';
```

#### 4.1.2 同步任务记录表 (sync_log)

```sql
CREATE TABLE IF NOT EXISTS sync_log (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(50) NOT NULL,
    interval VARCHAR(10) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    records_count INT NOT NULL,
    status VARCHAR(20) NOT NULL,  -- success, error
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sync_log_symbol_created ON sync_log(symbol, created_at DESC);
```

### 4.2 数据同步策略

**原则**: 只同步用户自选标的，减少数据量和同步开销

**同步任务由定时任务服务 (scheduler) 负责**，数据服务提供写库 API。

#### T+1 定时同步
- **执行者**: 定时任务服务
- **时间**: 每天凌晨 2 点
- **范围**: 从后端 API 获取所有自选标的列表
- **内容**: 同步前一交易日的 1d K线数据
- **流程**:
  1. 定时任务调用后端 API 获取所有自选标的 symbols
  2. 调用数据服务 API 获取每个标的的前一日 K线
  3. 调用数据服务 API 写入 TimescaleDB
  4. 记录同步日志

#### 新增自选即时同步
- **执行者**: 定时任务服务
- **触发**: 后端 API 监听自选添加事件，通过 HTTP 通知定时任务服务
- **内容**: 同步该标的历史 K线（默认 1 年）
- **周期**: 1d 日K
- **流程**:
  1. 用户添加自选 → 后端 API 成功
  2. 后端调用定时任务服务 webhook `/webhook/watchlist/added`
  3. 定时任务服务异步同步历史数据

#### 实时数据
- **不存储**: 当天正在进行的数据直接从 yfinance 获取
- **缓存**: 通过 Redis 缓存 30 秒，减少重复请求

#### 数据服务提供的同步接口

```http
# 写入 K线数据（由定时任务服务调用）
POST /api/admin/kline/sync
{
  "symbol": "AAPL",
  "interval": "1d",
  "data": [...]
}
```

---

## 五、缓存策略

### 5.1 Redis 缓存设计

#### 5.1.1 缓存 Key 设计

```
# 实时行情（30秒过期）
quote:{symbol}                    -> JSON (30s TTL)

# 批量行情（30秒过期）
quotes:{hash(symbols)}            -> JSON (30s TTL)

# K线数据（5分钟过期）
kline:{symbol}:{interval}         -> JSON (300s TTL)

# 技术指标（5分钟过期）
indicators:{symbol}:{interval}    -> JSON (300s TTL)
```

#### 5.1.2 缓存更新策略

| 数据类型 | TTL | 更新触发 |
|---------|-----|---------|
| 实时行情 | 30秒 | 定时轮询 / 用户请求时缓存未命中 |
| K线数据 | 5分钟 | 用户请求时缓存未命中 |
| 技术指标 | 5分钟 | 用户请求时缓存未命中 |

### 5.2 缓存失效

- 主动失效：无（等待 TTL 过期）
- 被动失效：数据同步任务完成后清除相关 K线缓存

---

## 六、技术指标计算

### 6.1 支持的指标

| 指标 | 参数 | 说明 |
|------|------|------|
| MA | 5, 10, 20, 60 | 简单移动平均 |
| EMA | 12, 26 | 指数移动平均 |
| MACD | 12, 26, 9 | 趋势动量指标 |
| RSI | 6, 12, 24 | 相对强弱指标 |
| KDJ | 9, 3, 3 | 随机指标 |
| BB | 20, 2 | 布林带 |

### 6.2 计算库

使用 `pandas` + `ta-lib` 或 `pandas-ta`:
- `pandas`: 数据处理
- `pandas-ta`: 技术指标计算（替代 TA-Lib，无需编译）

---

## 七、技术选型

| 层级 | 技术 | 理由 |
|------|------|------|
| 框架 | FastAPI | 高性能、异步支持、自动文档 |
| 数据源 | yfinance + AkShare | yfinance覆盖全球，AkShare覆盖A股 |
| 指标计算 | pandas + pandas-ta | 成熟生态、无需编译 |
| 数据库 | TimescaleDB | 时序数据优化、自动分区压缩 |
| 缓存 | Redis | 现有基础设施、性能优秀 |
| 异步 | asyncio + httpx | 高并发支持 |

### 依赖列表

```
fastapi>=0.104.0
uvicorn[standard]>=0.24.0
pydantic>=2.5.0
pydantic-settings>=2.1.0
yfinance>=0.2.32
akshare>=1.12.0
pandas>=2.1.0
pandas-ta>=0.3.14b0
asyncpg>=0.29.0  # PostgreSQL 异步驱动
redis>=5.0.0
httpx>=0.25.0     # 异步 HTTP 客户端
python-dotenv>=1.0.0
```

---

## 八、配置管理

### 8.1 环境变量

```bash
# 服务配置
PORT=8000
HOST=0.0.0.0
WORKERS=4

# Redis
REDIS_URL=redis://localhost:6379/0

# PostgreSQL (TimescaleDB)
DATABASE_URL=postgresql://admin:admin123@localhost:5432/trading_agent

# 数据源配置
YFINANCE_TIMEOUT=10          # yfinance 超时时间
YFINANCE_MAX_RETRIES=3       # yfinance 重试次数
AKSHARE_TIMEOUT=10           # AkShare 超时时间
AKSHARE_MAX_RETRIES=3        # AkShare 重试次数

# 缓存配置
CACHE_QUOTE_TTL=30           # 实时行情缓存时间（秒）
CACHE_KLINE_TTL=300          # K线缓存时间（秒）

# 日志
LOG_LEVEL=INFO
LOG_DIR=/var/log/trading-agent
```

### 8.2 配置文件

```python
# app/config.py
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # 服务
    port: int = 8000
    host: str = "0.0.0.0"
    workers: int = 4

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # Database
    database_url: str = "postgresql://admin:admin123@localhost:5432/trading_agent"

    # yfinance
    yfinance_timeout: int = 10
    yfinance_max_retries: int = 3

    # Cache TTL (seconds)
    cache_quote_ttl: int = 30
    cache_kline_ttl: int = 300

    # Log
    log_level: str = "INFO"

    class Config:
        env_file = ".env"

settings = Settings()
```

---

## 九、实施步骤

### Phase 1: 数据服务基础 (1-2天)

1. 创建 FastAPI 项目骨架
2. 实现 yfinance 客户端封装
3. 实现基础 API: `/api/quote`, `/api/kline`
4. 配置 Redis 缓存

**验收**: 能通过 API 获取 AAPL 的实时价格和日K数据

### Phase 2: 技术指标 (1天)

1. 实现指标计算服务
2. 实现 `/api/indicators` 接口
3. 支持所有 6 类指标

**验收**: 能获取 AAPL 的 MACD、RSI 等指标数据

### Phase 3: 数据库集成 (1天)

1. 配置 TimescaleDB
2. 创建 K线表和同步日志表
3. 实现写库 API: `/api/admin/kline/sync`

**验收**: 能通过 API 写入 K线数据到数据库

### Phase 4: 定时任务服务 (1天)

1. 创建 scheduler 服务骨架
2. 实现 K线同步定时任务
3. 实现新增自选 webhook
4. 配置 APScheduler

**验收**: 每天凌晨自动同步自选标的 K线

### Phase 5: 前端集成 (1天)

1. 修改前端 composables 调用数据服务 API
2. 替换模拟数据为真实数据
3. 实现定时轮询更新

**验收**: 自选列表显示真实价格和涨跌幅

---

## 十、定时任务服务

### 10.1 服务职责

- K线数据同步（T+1）
- 新增自选即时同步
- 价格提醒扫描（后续）
- AI市场雷达扫描（后续）
- AI宏观日报生成（后续）

### 10.2 技术选型

- **框架**: FastAPI（提供 webhook 接口）
- **调度**: APScheduler
- **通信**: HTTP 调用数据服务和后端 API

### 10.3 定时任务列表

| 任务名称 | 频率 | 优先级 | 说明 |
|---------|------|-------|------|
| K线同步 | 每天 02:00 | P0 | 同步前一交易日日K |
| 价格提醒扫描 | 每 1 分钟 | P1 | 检查价格是否触发提醒 |
| AI市场雷达 | 每 1 小时 | P1 | 扫描市场机会 |
| AI宏观日报 | 每天 08:00 | P1 | 生成市场早报 |

---

## 十一、监控与日志

### 11.1 MVP 阶段

- **健康检查**: 每个服务提供 `/health` 端点
- **日志记录**: 任务执行结果写入 `sync_log` 表
- **日志格式**: 结构化 JSON 日志，便于后续对接云服务

```python
# 统一日志格式
{
  "timestamp": "2026-05-20T02:00:00Z",
  "service": "market-data",
  "level": "INFO",
  "message": "K线同步完成",
  "context": {
    "symbol": "AAPL",
    "records": 252,
    "duration_ms": 1234
  }
}
```

### 11.2 扩展性设计

**预留对接云厂商日志系统的接口：**

| 云厂商 | 对接方式 | 预留设计 |
|--------|---------|---------|
| 阿里云 SLS | Logtail 采集 | 日志文件统一目录 `/var/log/trading-agent/` |
| 腾讯云 CLS | LogListener 采集 | 同上 |
| AWS CloudWatch | CloudWatch Agent | 同上 |
| Sentry | HTTP 上报 | 统一错误处理 hook |

**实现方式：**
```python
# app/utils/logger.py
class Logger:
    def __init__(self):
        self.handlers = []  # 预留多 handler 扩展
        self.add_handler(FileHandler("/var/log/trading-agent/app.log"))
        # 后续可添加:
        # self.add_handler(AliyunSLSHandler())
        # self.add_handler(SentryHandler())

    def add_handler(self, handler):
        self.handlers.append(handler)
```

### 11.3 告警规则（后续）

- 任务执行失败 → 立即告警
- 服务健康检查失败 → 3次后告警
- API 错误率超阈值 → 告警

---

## 十二、待决策事项

| 决策项 | 决策 |
|--------|------|
| 定时任务部署 | ✅ 独立服务 (services/scheduler) |
| 监控告警 | ✅ MVP用日志，预留云服务对接接口 |
| API 限流 | ✅ MVP 暂不做，Redis 缓存已足够 |

---

*文档版本: v0.1*
*创建日期: 2026-05-20*
