# 市场数据服务实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标:** 构建市场数据服务和定时任务服务，为前端提供实时行情和 K线数据

**架构:** 
- 数据服务 (FastAPI 8000端口): 封装 yfinance/AkShare，提供统一 API，通过 Redis 缓存，写入 TimescaleDB
- 定时任务服务 (8001端口): APScheduler 调度 K线同步、调用数据服务 API

**技术栈:** FastAPI, yfinance, AkShare, Redis, TimescaleDB, APScheduler

---

## 文件结构映射

```
services/
├── market-data/                    # 数据服务
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                 # FastAPI 入口
│   │   ├── config.py               # 配置管理
│   │   ├── api/
│   │   │   ├── __init__.py
│   │   │   ├── routes.py           # API 路由
│   │   │   └── models.py           # Pydantic 模型
│   │   ├── services/
│   │   │   ├── __init__.py
│   │   │   ├── base_client.py      # 数据源基类
│   │   │   ├── yfinance_client.py  # yfinance 客户端
│   │   │   ├── akshare_client.py   # AkShare 客户端
│   │   │   ├── indicators.py       # 技术指标计算
│   │   │   └── cache.py            # Redis 缓存
│   │   └── db/
│   │       ├── __init__.py
│   │       ├── connection.py       # DB 连接
│   │       └── models.py           # SQLAlchemy 模型
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .env.example
│
└── scheduler/                      # 定时任务服务
    ├── app/
    │   ├── __init__.py
    │   ├── main.py                 # FastAPI 入口 (webhook用)
    │   ├── config.py               # 配置管理
    │   ├── jobs/
    │   │   ├── __init__.py
    │   │   └── sync_kline.py       # K线同步任务
    │   └── clients/
    │       ├── __init__.py
    │       ├── backend_api.py      # 调用后端API
    │       └── data_api.py         # 调用数据服务API
    ├── requirements.txt
    ├── Dockerfile
    └── .env.example

backend/src/                          # 修改现有后端
├── routes/
│   └── webhook.ts               # 新增：接收定时任务webhook

frontend/app/composables/              # 修改现有前端
└── useMarketData.ts              # 新增：行情数据composable
```

---

## Phase 1: 数据服务基础架构

### Task 1: 创建数据服务项目结构

**Files:**
- Create: `services/market-data/app/__init__.py`
- Create: `services/market-data/app/config.py`
- Create: `services/market-data/requirements.txt`
- Create: `services/market-data/.env.example`
- Create: `services/market-data/Dockerfile`

- [ ] **Step 1: 创建目录结构**

```bash
mkdir -p services/market-data/app/{api,services,db}
```

- [ ] **Step 2: 写入配置文件**

```python
# services/market-data/app/config.py
from pydantic_settings import BaseSettings
from functools import lru_cache

class Settings(BaseSettings):
    # 服务配置
    app_name: str = "Market Data Service"
    version: str = "0.1.0"
    host: str = "0.0.0.0"
    port: int = 8000
    
    # Redis
    redis_url: str = "redis://localhost:6379/0"
    
    # PostgreSQL
    database_url: str = "postgresql://admin:admin123@localhost:5432/trading_agent"
    
    # 数据源配置
    yfinance_timeout: int = 10
    yfinance_max_retries: int = 3
    akshare_timeout: int = 10
    akshare_max_retries: int = 3
    
    # 缓存配置 (秒)
    cache_quote_ttl: int = 30
    cache_kline_ttl: int = 300
    
    # 日志
    log_level: str = "INFO"
    log_dir: str = "/var/log/trading-agent"
    
    class Config:
        env_file = ".env"

@lru_cache()
def get_settings() -> Settings:
    return Settings()
```

- [ ] **Step 3: 写入依赖文件**

```txt
# services/market-data/requirements.txt
fastapi>=0.104.0
uvicorn[standard]>=0.24.0
pydantic>=2.5.0
pydantic-settings>=2.1.0
yfinance>=0.2.32
akshare>=1.12.0
pandas>=2.1.0
pandas-ta>=0.3.14b0
asyncpg>=0.29.0
redis>=5.0.0
httpx>=0.25.0
python-dotenv>=1.0.0
```

- [ ] **Step 4: 写入环境变量示例**

```bash
# services/market-data/.env.example
PORT=8000
HOST=0.0.0.0
REDIS_URL=redis://localhost:6379/0
DATABASE_URL=postgresql://admin:admin123@localhost:5432/trading_agent
YFINANCE_TIMEOUT=10
YFINANCE_MAX_RETRIES=3
AKSHARE_TIMEOUT=10
AKSHARE_MAX_RETRIES=3
CACHE_QUOTE_TTL=30
CACHE_KLINE_TTL=300
LOG_LEVEL=INFO
LOG_DIR=/var/log/trading-agent
```

- [ ] **Step 5: 写入 Dockerfile**

```dockerfile
# services/market-data/Dockerfile
FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y gcc && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

- [ ] **Step 6: 初始化 Python 包**

```python
# services/market-data/app/__init__.py
__version__ = "0.1.0"
```

- [ ] **Step 7: 提交**

```bash
git add services/market-data/
git commit -m "feat: add market-data service structure"
```

---

### Task 2: 创建数据模型和 API 路由骨架

**Files:**
- Create: `services/market-data/app/api/models.py`
- Create: `services/market-data/app/api/routes.py`
- Create: `services/market-data/app/main.py`

- [ ] **Step 1: 创建数据模型**

```python
# services/market-data/app/api/models.py
from pydantic import BaseModel
from datetime import datetime
from decimal import Decimal
from typing import List, Optional

class QuoteData(BaseModel):
    symbol: str
    name: Optional[str] = None
    price: float
    change: float
    changePercent: float
    volume: Optional[int] = None
    high: Optional[float] = None
    low: Optional[float] = None
    open: Optional[float] = None
    previousClose: Optional[float] = None
    marketCap: Optional[int] = None
    currency: Optional[str] = "USD"
    timestamp: datetime

class QuotesResponse(BaseModel):
    data: List[QuoteData]
    timestamp: datetime

class KlineData(BaseModel):
    time: datetime
    open: float
    high: float
    low: float
    close: float
    volume: int

class KlineResponse(BaseModel):
    symbol: str
    interval: str
    data: List[KlineData]

class IndicatorsResponse(BaseModel):
    symbol: str
    interval: str
    indicators: dict

class HealthResponse(BaseModel):
    status: str
    timestamp: datetime

class ErrorResponse(BaseModel):
    error: str
    code: str
    message: str
```

- [ ] **Step 2: 创建 API 路由**

```python
# services/market-data/app/api/routes.py
from fastapi import APIRouter, HTTPException, Query
from datetime import datetime
from typing import List
from .models import QuoteData, QuotesResponse, KlineResponse, IndicatorsResponse, HealthResponse

router = APIRouter()

@router.get("/health", response_model=HealthResponse)
async def health_check():
    return HealthResponse(status="ok", timestamp=datetime.utcnow())

@router.get("/api/quote", response_model=QuoteData)
async def get_quote(symbol: str = Query(..., description="股票代码，如 AAPL, 000001.SZ")):
    # TODO: 实现获取单个标的行情
    raise HTTPException(status_code=501, detail="Not implemented")

@router.get("/api/quotes", response_model=QuotesResponse)
async def get_quotes(symbols: str = Query(..., description="逗号分隔的股票代码")):
    # TODO: 实现批量获取行情
    raise HTTPException(status_code=501, detail="Not implemented")

@router.get("/api/kline", response_model=KlineResponse)
async def get_kline(
    symbol: str = Query(..., description="股票代码"),
    interval: str = Query("1d", description="时间周期"),
    limit: int = Query(100, description="返回数量", le=500)
):
    # TODO: 实现获取K线数据
    raise HTTPException(status_code=501, detail="Not implemented")

@router.get("/api/indicators", response_model=IndicatorsResponse)
async def get_indicators(
    symbol: str = Query(..., description="股票代码"),
    indicators: str = Query(..., description="逗号分隔的指标名称")
):
    # TODO: 实现获取技术指标
    raise HTTPException(status_code=501, detail="Not implemented")
```

- [ ] **Step 3: 创建 FastAPI 主应用**

```python
# services/market-data/app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .api.routes import router
from .config import get_settings

settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    version=settings.version,
    docs_url="/docs",
    redoc_url="/redoc"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)

@app.on_event("startup")
async def startup():
    print(f"{settings.app_name} v{settings.version} starting...")

@app.on_event("shutdown")
async def shutdown():
    print(f"{settings.app_name} shutting down...")
```

- [ ] **Step 4: 测试启动服务**

```bash
cd services/market-data
python -m app.main
# 访问 http://localhost:8000/docs 查看 API 文档
```

- [ ] **Step 5: 提交**

```bash
git add services/market-data/
git commit -m "feat: add API routes and main application"
```

---

### Task 3: 实现 yfinance 数据源客户端

**Files:**
- Create: `services/market-data/app/services/base_client.py`
- Create: `services/market-data/app/services/yfinance_client.py`

- [ ] **Step 1: 创建数据源基类**

```python
# services/market-data/app/services/base_client.py
from abc import ABC, abstractmethod
from typing import List, Optional
from datetime import datetime
from ..api.models import QuoteData, KlineData

class BaseStockDataProvider(ABC):
    """数据源基类，所有数据源客户端继承此类"""
    
    @abstractmethod
    async def get_quote(self, symbol: str) -> QuoteData:
        """获取单个标的实时行情"""
        pass
    
    @abstractmethod
    async def get_quotes(self, symbols: List[str]) -> List[QuoteData]:
        """批量获取行情"""
        pass
    
    @abstractmethod
    async def get_kline(
        self, 
        symbol: str, 
        interval: str, 
        limit: int,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> List[KlineData]:
        """获取K线数据"""
        pass
    
    def supports_market(self, symbol: str) -> bool:
        """判断是否支持该市场"""
        return True
```

- [ ] **Step 2: 实现 yfinance 客户端**

```python
# services/market-data/app/services/yfinance_client.py
import yfinance as yf
import asyncio
from typing import List, Optional
from datetime import datetime, timedelta
from .base_client import BaseStockDataProvider
from ..api.models import QuoteData, KlineData
from ..config import get_settings

settings = get_settings()

class YFinanceClient(BaseStockDataProvider):
    """yfinance 数据源客户端 - 支持美股、港股"""
    
    def __init__(self):
        self.timeout = settings.yfinance_timeout
        self.max_retries = settings.yfinance_max_retries
    
    async def get_quote(self, symbol: str) -> QuoteData:
        ticker = await asyncio.to_thread(self._get_ticker, symbol)
        info = await asyncio.to_thread(lambda: ticker.info)
        
        fast_info = await asyncio.to_thread(lambda: ticker.fast_info)
        
        current_price = fast_info.last_price
        previous_close = fast_info.previous_close
        
        return QuoteData(
            symbol=symbol,
            name=ticker.info.get("longName") or ticker.info.get("shortName"),
            price=current_price,
            change=current_price - previous_close,
            changePercent=((current_price - previous_close) / previous_close * 100) if previous_close else 0,
            volume=int(ticker.info.get("volume", 0)),
            high=fast_info.day_high,
            low=fast_info.day_low,
            open=fast_info.day_open,
            previousClose=previous_close,
            marketCap=ticker.info.get("marketCap"),
            currency=ticker.info.get("currency", "USD"),
            timestamp=datetime.utcnow()
        )
    
    async def get_quotes(self, symbols: List[str]) -> List[QuoteData]:
        tasks = [self.get_quote(s) for s in symbols]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        return [r for r in results if isinstance(r, QuoteData)]
    
    async def get_kline(
        self, 
        symbol: str, 
        interval: str, 
        limit: int,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> List[KlineData]:
        # 映射 interval 到 yfinance 格式
        interval_map = {
            "1m": "1m", "5m": "5m", "15m": "15m", "30m": "30m",
            "1h": "1h", "4h": "4h", "1d": "1d", "1w": "1wk"
        }
        yf_interval = interval_map.get(interval, "1d")
        
        end = end_date or datetime.now()
        start = start_date or (end - timedelta(days=limit * 2))  # 粗略估算
        
        ticker = await asyncio.to_thread(self._get_ticker, symbol)
        df = await asyncio.to_thread(
            lambda: ticker.history(
                interval=yf_interval,
                start=start,
                end=end,
            )
        )
        
        klines = []
        for timestamp, row in df.tail(limit).iterrows():
            klines.append(KlineData(
                time=timestamp.to_pydatetime(),
                open=float(row['Open']),
                high=float(row['High']),
                low=float(row['Low']),
                close=float(row['Close']),
                volume=int(row['Volume'])
            ))
        
        return klines
    
    def _get_ticker(self, symbol: str):
        """同步获取 ticker 对象"""
        return yf.Ticker(symbol)
    
    def supports_market(self, symbol: str) -> bool:
        """判断是否支持该市场"""
        # yfinance 支持美股、港股 (xxx.HK)
        # A股 (xxx.SZ/xxx.SH) 也支持但数据不全
        return True  # 暂时全部支持
```

- [ ] **Step 3: 提交**

```bash
git add services/market-data/
git commit -m "feat: add yfinance data source client"
```

---

### Task 4: 实现 AkShare 数据源客户端

**Files:**
- Create: `services/market-data/app/services/akshare_client.py`

- [ ] **Step 1: 实现 AkShare 客户端**

```python
# services/market-data/app/services/akshare_client.py
import akshare as ak
import asyncio
from typing import List, Optional
from datetime import datetime, timedelta
from .base_client import BaseStockDataProvider
from ..api.models import QuoteData, KlineData
from ..config import get_settings

settings = get_settings()

class AkShareClient(BaseStockDataProvider):
    """AkShare 数据源客户端 - 支持 A股、港股"""
    
    def __init__(self):
        self.timeout = settings.akshare_timeout
        self.max_retries = settings.akshare_max_retries
    
    async def get_quote(self, symbol: str) -> QuoteData:
        # AkShare 获取实时行情
        # 支持 A股: 000001, 600000
        # 支持港股: 00700 (无后缀)
        
        # 判断市场
        if self._is_a_stock(symbol):
            df = await asyncio.to_thread(ak.stock_zh_a_spot_em)
            row = df[df['代码'] == symbol].iloc[0] if symbol in df['代码'].values else None
        elif self._is_hk_stock(symbol):
            df = await asyncio.to_thread(ak.stock_hk_spot_em)
            row = df[df['代码'] == symbol].iloc[0] if symbol in df['代码'].values else None
        else:
            raise ValueError(f"Unsupported symbol: {symbol}")
        
        if row is None:
            raise ValueError(f"Symbol {symbol} not found")
        
        current_price = float(row['最新价'])
        previous_close = float(row['昨收'])
        
        return QuoteData(
            symbol=symbol,
            name=row['名称'],
            price=current_price,
            change=current_price - previous_close,
            changePercent=((current_price - previous_close) / previous_close * 100) if previous_close else 0,
            volume=int(row['成交量']) if '成交量' in row else None,
            high=float(row['最高']) if '最高' in row else None,
            low=float(row['最低']) if '最低' in row else None,
            open=float(row['今开']) if '今开' in row else None,
            previousClose=previous_close,
            currency="CNY" if self._is_a_stock(symbol) else "HKD",
            timestamp=datetime.utcnow()
        )
    
    async def get_quotes(self, symbols: List[str]) -> List[QuoteData]:
        tasks = [self.get_quote(s) for s in symbols]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        return [r for r in results if isinstance(r, QuoteData)]
    
    async def get_kline(
        self, 
        symbol: str, 
        interval: str, 
        limit: int,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> List[KlineData]:
        # AkShare 历史K线
        end = end_date or datetime.now()
        start = start_date or (end - timedelta(days=365))  # 默认1年
        
        start_str = start.strftime("%Y%m%d")
        end_str = end.strftime("%Y%m%d")
        
        if self._is_a_stock(symbol):
            # A股
            adjust = ""  # 不复权
            df = await asyncio.to_thread(
                lambda: ak.stock_zh_a_hist(
                    symbol=symbol,
                    period="daily",
                    start_date=start_str,
                    end_date=end_str,
                    adjust=adjust
                )
            )
        elif self._is_hk_stock(symbol):
            # 港股
            df = await asyncio.to_thread(
                lambda: ak.stock_hk_hist(
                    symbol=symbol,
                    period="daily",
                    start_date=start_str,
                    end_date=end_str,
                    adjust="qfq"
                )
            )
        else:
            raise ValueError(f"Unsupported symbol: {symbol}")
        
        klines = []
        for _, row in df.tail(limit).iterrows():
            klines.append(KlineData(
                time=pd.to_datetime(row['日期']).to_pydatetime(),
                open=float(row['开盘']),
                high=float(row['最高']),
                low=float(row['最低']),
                close=float(row['收盘']),
                volume=int(row['成交量'])
            ))
        
        return klines
    
    def _is_a_stock(self, symbol: str) -> bool:
        """判断是否为A股"""
        # A股代码: 6位数字
        return symbol.isdigit() and len(symbol) == 6
    
    def _is_hk_stock(self, symbol: str) -> bool:
        """判断是否为港股"""
        # 港股代码: 通常以0开头，5位数字
        return symbol.isdigit() and len(symbol) <= 5
    
    def supports_market(self, symbol: str) -> bool:
        """判断是否支持该市场"""
        return self._is_a_stock(symbol) or self._is_hk_stock(symbol)
```

- [ ] **Step 2: 修复 pandas 导入**

需要在文件顶部添加：

```python
import pandas as pd
```

- [ ] **Step 3: 提交**

```bash
git add services/market-data/
git commit -m "feat: add akshare data source client"
```

---

### Task 5: 实现 Redis 缓存

**Files:**
- Create: `services/market-data/app/services/cache.py`

- [ ] **Step 1: 实现 Redis 缓存服务**

```python
# services/market-data/app/services/cache.py
import json
import hashlib
from typing import Optional, Any, List
from datetime import timedelta
import redis.asyncio as redis
from ..config import get_settings

settings = get_settings()

class CacheService:
    """Redis 缓存服务"""
    
    def __init__(self):
        self.redis: Optional[redis.Redis] = None
        self.quote_ttl = settings.cache_quote_ttl
        self.kline_ttl = settings.cache_kline_ttl
    
    async def connect(self):
        """连接 Redis"""
        self.redis = await redis.from_url(
            settings.redis_url,
            encoding="utf-8",
            decode_responses=True
        )
    
    async def close(self):
        """关闭连接"""
        if self.redis:
            await self.redis.close()
    
    def _quote_key(self, symbol: str) -> str:
        return f"quote:{symbol}"
    
    def _quotes_key(self, symbols: List[str]) -> str:
        symbols_str = ",".join(sorted(symbols))
        hash_key = hashlib.md5(symbols_str.encode()).hexdigest()[:8]
        return f"quotes:{hash_key}"
    
    def _kline_key(self, symbol: str, interval: str) -> str:
        return f"kline:{symbol}:{interval}"
    
    def _indicators_key(self, symbol: str, interval: str) -> str:
        return f"indicators:{symbol}:{interval}"
    
    async def get_quote(self, symbol: str) -> Optional[dict]:
        """获取缓存的行情"""
        if not self.redis:
            return None
        data = await self.redis.get(self._quote_key(symbol))
        return json.loads(data) if data else None
    
    async def set_quote(self, symbol: str, data: dict):
        """缓存行情"""
        if not self.redis:
            return
        await self.redis.setex(
            self._quote_key(symbol),
            self.quote_ttl,
            json.dumps(data)
        )
    
    async def get_quotes(self, symbols: List[str]) -> Optional[dict]:
        """获取缓存的批量行情"""
        if not self.redis:
            return None
        data = await self.redis.get(self._quotes_key(symbols))
        return json.loads(data) if data else None
    
    async def set_quotes(self, symbols: List[str], data: dict):
        """缓存批量行情"""
        if not self.redis:
            return
        await self.redis.setex(
            self._quotes_key(symbols),
            self.quote_ttl,
            json.dumps(data)
        )
    
    async def get_kline(self, symbol: str, interval: str) -> Optional[dict]:
        """获取缓存的K线"""
        if not self.redis:
            return None
        data = await self.redis.get(self._kline_key(symbol, interval))
        return json.loads(data) if data else None
    
    async def set_kline(self, symbol: str, interval: str, data: dict):
        """缓存K线"""
        if not self.redis:
            return
        await self.redis.setex(
            self._kline_key(symbol, interval),
            self.kline_ttl,
            json.dumps(data)
        )
    
    async def delete_kline(self, symbol: str, interval: str):
        """删除K线缓存（数据更新时调用）"""
        if not self.redis:
            return
        await self.redis.delete(self._kline_key(symbol, interval))

# 全局缓存实例
cache = CacheService()
```

- [ ] **Step 2: 更新主应用使用缓存**

```python
# services/market-data/app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .api.routes import router
from .config import get_settings
from .services.cache import cache

settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    version=settings.version,
    docs_url="/docs",
    redoc_url="/redoc"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)

@app.on_event("startup")
async def startup():
    await cache.connect()
    print(f"{settings.app_name} v{settings.version} starting...")

@app.on_event("shutdown")
async def shutdown():
    await cache.close()
    print(f"{settings.app_name} shutting down...")
```

- [ ] **Step 3: 提交**

```bash
git add services/market-data/
git commit -m "feat: add redis cache service"
```

---

### Task 6: 集成数据源和缓存到 API 路由

**Files:**
- Modify: `services/market-data/app/api/routes.py`

- [ ] **Step 1: 更新 API 路由实现**

```python
# services/market-data/app/api/routes.py
from fastapi import APIRouter, HTTPException, Query
from datetime import datetime
from typing import List
from .models import QuoteData, QuotesResponse, KlineResponse, IndicatorsResponse, HealthResponse
from ..services.yfinance_client import YFinanceClient
from ..services.akshare_client import AkShareClient
from ..services.cache import cache

router = APIRouter()

# 初始化数据源客户端
yf_client = YFinanceClient()
aks_client = AkShareClient()

def get_client(symbol: str):
    """根据标的代码选择合适的客户端"""
    # 优先使用 AkShare（A股、港股）
    if aks_client.supports_market(symbol):
        return aks_client
    # 其他使用 yfinance（美股）
    return yf_client

@router.get("/health", response_model=HealthResponse)
async def health_check():
    return HealthResponse(status="ok", timestamp=datetime.utcnow())

@router.get("/api/quote", response_model=QuoteData)
async def get_quote(symbol: str = Query(..., description="股票代码，如 AAPL, 000001, 0700.HK")):
    # 先查缓存
    cached = await cache.get_quote(symbol)
    if cached:
        return QuoteData(**cached)
    
    # 获取实时数据
    client = get_client(symbol)
    quote = await client.get_quote(symbol)
    
    # 写入缓存
    await cache.set_quote(symbol, quote.dict())
    
    return quote

@router.get("/api/quotes", response_model=QuotesResponse)
async def get_quotes(symbols: str = Query(..., description="逗号分隔的股票代码")):
    symbol_list = [s.strip() for s in symbols.split(",")][:50]  # 最多50个
    
    # 先查缓存
    cached = await cache.get_quotes(symbol_list)
    if cached:
        return QuotesResponse(**cached)
    
    # 分组获取（A股/港股用 AkShare，美股用 yfinance）
    aks_symbols = [s for s in symbol_list if aks_client.supports_market(s)]
    yf_symbols = [s for s in symbol_list if s not in aks_symbols]
    
    results = []
    if aks_symbols:
        results.extend(await aks_client.get_quotes(aks_symbols))
    if yf_symbols:
        results.extend(await yf_client.get_quotes(yf_symbols))
    
    response = QuotesResponse(data=results, timestamp=datetime.utcnow())
    
    # 写入缓存
    await cache.set_quotes(symbol_list, response.dict())
    
    return response

@router.get("/api/kline", response_model=KlineResponse)
async def get_kline(
    symbol: str = Query(..., description="股票代码"),
    interval: str = Query("1d", description="时间周期"),
    limit: int = Query(100, description="返回数量", le=500)
):
    # 先查缓存
    cached = await cache.get_kline(symbol, interval)
    if cached:
        return KlineResponse(**cached)
    
    # 获取K线数据
    client = get_client(symbol)
    klines = await client.get_kline(symbol, interval, limit)
    
    response = KlineResponse(symbol=symbol, interval=interval, data=klines)
    
    # 写入缓存
    await cache.set_kline(symbol, interval, response.dict())
    
    return response

@router.get("/api/indicators", response_model=IndicatorsResponse)
async def get_indicators(
    symbol: str = Query(..., description="股票代码"),
    indicators: str = Query(..., description="逗号分隔的指标名称")
):
    # TODO: 实现技术指标计算
    raise HTTPException(status_code=501, detail="Indicators not implemented yet")
```

- [ ] **Step 2: 提交**

```bash
git add services/market-data/
git commit -m "feat: integrate data sources and cache into API routes"
```

---

### Task 7: 添加数据服务到 docker-compose

**Files:**
- Modify: `docker-compose.yml`

- [ ] **Step 1: 更新 docker-compose.yml**

```yaml
# 在现有 docker-compose.yml 添加
  market-data:
    build: ./services/market-data
    container_name: trading-agent-market-data
    ports:
      - "8000:8000"
    environment:
      - REDIS_URL=redis://redis:6379/0
      - DATABASE_URL=postgresql://admin:admin123@postgres:5432/trading_agent
    depends_on:
      - redis
      - postgres
    restart: unless-stopped
```

- [ ] **Step 2: 提交**

```bash
git add docker-compose.yml
git commit -m "feat: add market-data service to docker-compose"
```

---

### Task 8: 前端集成 - 调用数据服务 API

**Files:**
- Modify: `frontend/app/composables/useMarketData.ts`

- [ ] **Step 1: 创建市场数据 composable**

```typescript
// frontend/app/composables/useMarketData.ts
const API_BASE = 'http://localhost:8000'

export interface QuoteData {
  symbol: string
  name?: string
  price: number
  change: number
  changePercent: number
  volume?: number
  high?: number
  low?: number
  open?: number
  previousClose?: number
  timestamp: string
}

export interface KlineData {
  time: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export const useMarketData = () => {
  // 获取单个标的行情
  async function getQuote(symbol: string): Promise<QuoteData> {
    const response = await $fetch(`${API_BASE}/api/quote?symbol=${symbol}`)
    return response as QuoteData
  }

  // 批量获取行情
  async function getQuotes(symbols: string[]): Promise<QuoteData[]> {
    const symbolsStr = symbols.join(',')
    const response = await $fetch(`${API_BASE}/api/quotes?symbols=${symbolsStr}`)
    return (response as any).data
  }

  // 获取K线数据
  async function getKline(
    symbol: string,
    interval: string = '1d',
    limit: number = 100
  ): Promise<{ symbol: string; interval: string; data: KlineData[] }> {
    const response = await $fetch(
      `${API_BASE}/api/kline?symbol=${symbol}&interval=${interval}&limit=${limit}`
    )
    return response as { symbol: string; interval: string; data: KlineData[] }
  }

  return {
    getQuote,
    getQuotes,
    getKline,
  }
}
```

- [ ] **Step 2: 更新自选页面使用真实数据**

```typescript
// frontend/app/components/watchlist/WatchlistGrid.vue
// 修改 computed 部分，替换模拟数据
const itemsWithChange = computed(() => {
  return props.items.map(item => ({
    ...item,
    // 后续从 API 获取，暂时保留模拟数据
    change: (Math.random() - 0.5) * 10,
    price: Math.random() * 1000 + 50,
  }))
})
```

- [ ] **Step 3: 提交**

```bash
git add frontend/app/composables/useMarketData.ts
git commit -m "feat: add market data composable"
```

---

## Phase 2: 技术指标计算

### Task 9: 实现技术指标计算服务

**Files:**
- Create: `services/market-data/app/services/indicators.py`

- [ ] **Step 1: 实现指标计算**

```python
# services/market-data/app/services/indicators.py
import pandas as pd
import pandas_ta as ta
from typing import List, Dict
from ..api.models import KlineData

class IndicatorsCalculator:
    """技术指标计算器"""
    
    def __init__(self, klines: List[KlineData]):
        self.df = self._klines_to_df(klines)
    
    def _klines_to_df(self, klines: List[KlineData]) -> pd.DataFrame:
        """将 K线数据转换为 DataFrame"""
        data = {
            'time': [k.time for k in klines],
            'open': [k.open for k in klines],
            'high': [k.high for k in klines],
            'low': [k.low for k in klines],
            'close': [k.close for k in klines],
            'volume': [k.volume for k in klines],
        }
        df = pd.DataFrame(data)
        df['time'] = pd.to_datetime(df['time'])
        df.set_index('time', inplace=True)
        return df
    
    def calculate_ma(self, periods: List[int] = [5, 10, 20, 60]) -> Dict[str, float]:
        """计算移动平均线 MA"""
        result = {}
        for period in periods:
            ma = self.df['close'].rolling(window=period).mean().iloc[-1]
            result[f'MA{period}'] = float(ma) if pd.notna(ma) else None
        return result
    
    def calculate_ema(self, periods: List[int] = [12, 26]) -> Dict[str, float]:
        """计算指数移动平均 EMA"""
        result = {}
        for period in periods:
            ema = self.df['close'].ewm(span=period).mean().iloc[-1]
            result[f'EMA{period}'] = float(ema) if pd.notna(ema) else None
        return result
    
    def calculate_macd(self, fast: int = 12, slow: int = 26, signal: int = 9) -> Dict[str, float]:
        """计算 MACD"""
        macd_df = ta.macd(self.df['close'], fast=fast, slow=slow, signal=signal)
        if macd_df is not None and not macd_df.empty:
            last = macd_df.iloc[-1]
            return {
                'MACD': float(last[f'MACD_{fast}_{slow}_{signal}']) if pd.notna(last[f'MACD_{fast}_{slow}_{signal}']) else None,
                'Signal': float(last[f'MACDs_{fast}_{slow}_{signal}']) if pd.notna(last[f'MACDs_{fast}_{slow}_{signal}']) else None,
                'Histogram': float(last[f'MACDh_{fast}_{slow}_{signal}']) if pd.notna(last[f'MACDh_{fast}_{slow}_{signal}']) else None,
            }
        return {'MACD': None, 'Signal': None, 'Histogram': None}
    
    def calculate_rsi(self, periods: List[int] = [6, 12, 24]) -> Dict[str, float]:
        """计算 RSI"""
        result = {}
        for period in periods:
            rsi_df = ta.rsi(self.df['close'], length=period)
            if rsi_df is not None and not rsi_df.empty:
                rsi = rsi_df.iloc[-1].iloc[0]
                result[f'RSI{period}'] = float(rsi) if pd.notna(rsi) else None
        return result
    
    def calculate_kdj(self, n: int = 9, m1: int = 3, m2: int = 3) -> Dict[str, float]:
        """计算 KDJ"""
        # KDJ = (RSV * (2/3) + 前一日K * (1/3))
        # RSV = (收盘价 - 最低价) / (最高价 - 最低价) * 100
        low = self.df['low'].rolling(window=n).min()
        high = self.df['high'].rolling(window=n).max()
        rsv = (self.df['close'] - low) / (high - low) * 100
        
        k = rsv.ewm(com=1 / m1, adjust=False).mean()
        d = k.ewm(com=1 / m2, adjust=False).mean()
        j = 3 * k - 2 * d
        
        return {
            'K': float(k.iloc[-1]) if pd.notna(k.iloc[-1]) else None,
            'D': float(d.iloc[-1]) if pd.notna(d.iloc[-1]) else None,
            'J': float(j.iloc[-1]) if pd.notna(j.iloc[-1]) else None,
        }
    
    def calculate_bollinger_bands(self, period: int = 20, std_dev: int = 2) -> Dict[str, float]:
        """计算布林带"""
        bb = ta.bollinger_bands(self.df['close'], length=period, std=std_dev)
        if bb is not None and not bb.empty:
            last = bb.iloc[-1]
            return {
                'upper': float(last[f'BBL_{period}_{std_dev}.0']) if pd.notna(last[f'BBL_{period}_{std_dev}.0']) else None,
                'middle': float(last[f'BBM_{period}_{std_dev}.0']) if pd.notna(last[f'BBM_{period}_{std_dev}.0']) else None,
                'lower': float(last[f'BBU_{period}_{std_dev}.0']) if pd.notna(last[f'BBU_{period}_{std_dev}.0']) else None,
                'bandwidth': None,  # TODO: 计算 bandwidth
            }
        return {'upper': None, 'middle': None, 'lower': None, 'bandwidth': None}
    
    def calculate_all(self, indicator_list: List[str]) -> Dict:
        """计算所有请求的指标"""
        result = {}
        
        if 'MA' in indicator_list or 'all' in indicator_list:
            result['MA'] = self.calculate_ma()
        if 'EMA' in indicator_list or 'all' in indicator_list:
            result['EMA'] = self.calculate_ema()
        if 'MACD' in indicator_list or 'all' in indicator_list:
            result['MACD'] = self.calculate_macd()
        if 'RSI' in indicator_list or 'all' in indicator_list:
            result['RSI'] = self.calculate_rsi()
        if 'KDJ' in indicator_list or 'all' in indicator_list:
            result['KDJ'] = self.calculate_kdj()
        if 'BB' in indicator_list or 'Bollinger' in indicator_list or 'all' in indicator_list:
            result['BB'] = self.calculate_bollinger_bands()
        
        return result
```

- [ ] **Step 2: 提交**

```bash
git add services/market-data/
git commit -m "feat: add technical indicators calculator"
```

---

### Task 10: 实现指标 API 路由

**Files:**
- Modify: `services/market-data/app/api/routes.py`

- [ ] **Step 1: 实现 /api/indicators 路由**

```python
# 在 services/market-data/app/api/routes.py 添加
from ..services.indicators import IndicatorsCalculator

@router.get("/api/indicators", response_model=IndicatorsResponse)
async def get_indicators(
    symbol: str = Query(..., description="股票代码"),
    indicators: str = Query(..., description="逗号分隔的指标名称"),
    interval: str = Query("1d", description="时间周期"),
    period: int = Query(100, description="数据周期数")
):
    indicator_list = [i.strip() for i in indicators.split(",")]
    
    # 获取K线数据
    client = get_client(symbol)
    klines = await client.get_kline(symbol, interval, period)
    
    if not klines:
        raise HTTPException(status_code=404, detail=f"No data found for {symbol}")
    
    # 计算指标
    calculator = IndicatorsCalculator(klines)
    result = calculator.calculate_all(indicator_list)
    
    return IndicatorsResponse(
        symbol=symbol,
        interval=interval,
        indicators=result
    )
```

- [ ] **Step 2: 移除之前的 501 错误**

删除或注释掉之前占位的 raise HTTPException

- [ ] **Step 3: 提交**

```bash
git add services/market-data/
git commit -m "feat: implement indicators API endpoint"
```

---

## Phase 3: 数据库集成

### Task 11: 配置 TimescaleDB

**Files:**
- Create: `services/market-data/app/db/connection.py`
- Create: `services/market-data/app/db/models.py`

- [ ] **Step 1: 创建数据库连接**

```python
# services/market-data/app/db/connection.py
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from ..config import get_settings

settings = get_settings()

engine = create_async_engine(
    settings.database_url.replace("postgresql://", "postgresql+asyncpg://"),
    echo=False
)

async_session = sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)

async def get_db():
    async with async_session() as session:
        yield session
```

- [ ] **Step 2: 创建数据库模型**

```python
# services/market-data/app/db/models.py
from sqlalchemy import Column, String, DateTime, Numeric, BigInteger, Integer, Text
from sqlalchemy.sql import func
from sqlalchemy.ext.declarative import declarative_base

Base = declarative_base()

class OHLCV(Base):
    """K线数据表"""
    __tablename__ = "ohlcv"
    
    time = Column(DateTime, primary_key=True)
    symbol = Column(String(50), primary_key=True)
    interval = Column(String(10), primary_key=True)
    open = Column(Numeric(20, 8), nullable=False)
    high = Column(Numeric(20, 8), nullable=False)
    low = Column(Numeric(20, 8), nullable=False)
    close = Column(Numeric(20, 8), nullable=False)
    volume = Column(BigInteger, nullable=False)
    created_at = Column(DateTime, server_default=func.now())

class SyncLog(Base):
    """同步日志表"""
    __tablename__ = "sync_log"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    symbol = Column(String(50), nullable=False)
    interval = Column(String(10), nullable=False)
    start_date = Column(DateTime, nullable=False)
    end_date = Column(DateTime, nullable=False)
    records_count = Column(Integer, nullable=False)
    status = Column(String(20), nullable=False)  # success, error
    error_message = Column(Text)
    created_at = Column(DateTime, server_default=func.now())
```

- [ ] **Step 3: 创建数据库初始化脚本**

```python
# services/market-data/app/db/init_db.py
import asyncio
from sqlalchemy import text
from .connection import engine
from .models import Base

async def init_database():
    """初始化数据库表"""
    async with engine.begin() as conn:
        # 创建超表
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS ohlcv (
                time TIMESTAMPTZ NOT NULL,
                symbol VARCHAR(50) NOT NULL,
                interval VARCHAR(10) NOT NULL,
                open DECIMAL(20, 8) NOT NULL,
                high DECIMAL(20, 8) NOT NULL,
                low DECIMAL(20, 8) NOT NULL,
                close DECIMAL(20, 8) NOT NULL,
                volume BIGINT NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                PRIMARY KEY (time, symbol, interval)
            );
        """))
        
        # 转换为超表
        await conn.execute(text("""
            SELECT create_hypertable('ohlcv', 'time', if_not_exists => TRUE);
        """))
        
        # 创建索引
        await conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_ohlcv_symbol_time ON ohlcv(symbol, time DESC);
        """))
        await conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_ohlcv_symbol_interval ON ohlcv(symbol, interval, time DESC);
        """))
        
        # 创建同步日志表
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS sync_log (
                id SERIAL PRIMARY KEY,
                symbol VARCHAR(50) NOT NULL,
                interval VARCHAR(10) NOT NULL,
                start_date DATE NOT NULL,
                end_date DATE NOT NULL,
                records_count INT NOT NULL,
                status VARCHAR(20) NOT NULL,
                error_message TEXT,
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
        """))
        
        await conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_sync_log_symbol_created ON sync_log(symbol, created_at DESC);
        """))
    
    print("Database initialized successfully")

if __name__ == "__main__":
    asyncio.run(init_database())
```

- [ ] **Step 4: 提交**

```bash
git add services/market-data/
git commit -m "feat: add database models and initialization"
```

---

### Task 12: 实现写库 API

**Files:**
- Modify: `services/market-data/app/api/routes.py`

- [ ] **Step 1: 添加 K线写库接口**

```python
# 在 services/market-data/app/api/routes.py 添加
from ..db.models import OHLCV, SyncLog
from sqlalchemy.ext.asyncio import AsyncSession
from .connection import async_session
from datetime import datetime

@router.post("/api/admin/kline/sync")
async def sync_kline(data: dict):
    """写入K线数据（由定时任务服务调用）"""
    symbol = data.get("symbol")
    interval = data.get("interval", "1d")
    klines_data = data.get("data", [])
    
    async with async_session() as session:
        count = 0
        for k in klines_data:
            ohlcv = OHLCV(
                time=datetime.fromisoformat(k['time'].replace('Z', '+00:00')),
                symbol=symbol,
                interval=interval,
                open=k['open'],
                high=k['high'],
                low=k['low'],
                close=k['close'],
                volume=k['volume']
            )
            # 使用 ON CONFLICT 处理重复数据
            await session.merge(ohlcv)
            count += 1
        
        await session.commit()
        
        # 记录同步日志
        log = SyncLog(
            symbol=symbol,
            interval=interval,
            start_date=datetime.fromisoformat(klines_data[0]['time'].replace('Z', '+00:00')),
            end_date=datetime.fromisoformat(klines_data[-1]['time'].replace('Z', '+00:00')),
            records_count=count,
            status="success"
        )
        await session.add(log)
        await session.commit()
    
    return {"status": "ok", "count": count}
```

- [ ] **Step 2: 提交**

```bash
git add services/market-data/
git commit -m "feat: add kline sync API endpoint"
```

---

## Phase 4: 定时任务服务

### Task 13: 创建定时任务服务结构

**Files:**
- Create: `services/scheduler/app/__init__.py`
- Create: `services/scheduler/app/main.py`
- Create: `services/scheduler/app/config.py`
- Create: `services/scheduler/requirements.txt`
- Create: `services/scheduler/Dockerfile`
- Create: `services/scheduler/.env.example`

- [ ] **Step 1: 创建目录结构**

```bash
mkdir -p services/scheduler/app/{jobs,clients}
```

- [ ] **Step 2: 写入配置文件**

```python
# services/scheduler/app/config.py
from pydantic_settings import BaseSettings
from functools import lru_cache

class Settings(BaseSettings):
    # 服务配置
    app_name: str = "Scheduler Service"
    version: str = "0.1.0"
    host: str = "0.0.0.0"
    port: int = 8001
    
    # 后端 API (获取自选列表)
    backend_api_url: str = "http://localhost:3002"
    
    # 数据服务 API
    data_api_url: str = "http://localhost:8000"
    
    # 日志
    log_level: str = "INFO"
    log_dir: str = "/var/log/trading-agent"
    
    class Config:
        env_file = ".env"

@lru_cache()
def get_settings() -> Settings:
    return Settings()
```

- [ ] **Step 3: 写入依赖文件**

```txt
# services/scheduler/requirements.txt
fastapi>=0.104.0
uvicorn[standard]>=0.24.0
pydantic>=2.5.0
pydantic-settings>=2.1.0
apscheduler>=3.10.0
httpx>=0.25.0
python-dotenv>=1.0.0
```

- [ ] **Step 4: 写入环境变量示例**

```bash
# services/scheduler/.env.example
PORT=8001
HOST=0.0.0.0
BACKEND_API_URL=http://localhost:3002
DATA_API_URL=http://localhost:8000
LOG_LEVEL=INFO
LOG_DIR=/var/log/trading-agent
```

- [ ] **Step 5: 写入 Dockerfile**

```dockerfile
# services/scheduler/Dockerfile
FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y gcc && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8001

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
```

- [ ] **Step 6: 初始化 Python 包**

```python
# services/scheduler/app/__init__.py
__version__ = "0.1.0"
```

- [ ] **Step 7: 提交**

```bash
git add services/scheduler/
git commit -m "feat: add scheduler service structure"
```

---

### Task 14: 实现定时任务服务主应用

**Files:**
- Create: `services/scheduler/app/main.py`

- [ ] **Step 1: 创建主应用**

```python
# services/scheduler/app/main.py
from fastapi import FastAPI
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from .config import get_settings
from .jobs.sync_kline import sync_watchlist_klines

settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    version=settings.version,
    docs_url="/docs",
    redoc_url="/redoc"
)

scheduler = AsyncIOScheduler()

@app.on_event("startup")
async def startup():
    # 每天凌晨 2 点执行 K线同步
    scheduler.add_job(
        sync_watchlist_klines,
        'cron',
        hour=2,
        minute=0,
        id='sync_watchlist_klines'
    )
    scheduler.start()
    print(f"{settings.app_name} v{settings.version} started with scheduler")

@app.on_event("shutdown")
async def shutdown():
    scheduler.shutdown()
    print(f"{settings.app_name} shutting down...")

@app.get("/health")
async def health():
    return {"status": "ok", "scheduler": "running"}

# Webhook 接口
@app.post("/webhook/watchlist/added")
async def on_watchlist_added(data: dict):
    """新增自选时触发"""
    symbol = data.get("symbol")
    if symbol:
        # TODO: 异步触发历史数据同步
        return {"status": "scheduled", "symbol": symbol}
    return {"status": "error", "message": "symbol required"}
```

- [ ] **Step 2: 提交**

```bash
git add services/scheduler/
git commit -m "feat: add scheduler main application"
```

---

### Task 15: 实现 K线同步任务

**Files:**
- Create: `services/scheduler/app/jobs/sync_kline.py`
- Create: `services/scheduler/app/clients/backend_api.py`
- Create: `services/scheduler/app/clients/data_api.py`

- [ ] **Step 1: 创建后端 API 客户端**

```python
# services/scheduler/app/clients/backend_api.py
import httpx
from ..config import get_settings

settings = get_settings()

class BackendAPIClient:
    """后端 API 客户端 - 获取自选列表"""
    
    def __init__(self):
        self.base_url = settings.backend_api_url
    
    async def get_watchlist_symbols(self) -> list:
        """获取所有自选标的代码"""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}/api/watchlist/items"
            )
            # 假设后端有这个接口，返回所有自选标的 symbol
            items = response.json().get("items", [])
            return [item.get("symbol") for item in items if item.get("symbol")]

backend_api = BackendAPIClient()
```

- [ ] **Step 2: 创建数据服务 API 客户端**

```python
# services/scheduler/app/clients/data_api.py
import httpx
from typing import List
from ..config import get_settings

settings = get_settings()

class DataAPIClient:
    """数据服务 API 客户端"""
    
    def __init__(self):
        self.base_url = settings.data_api_url
    
    async def get_kline(self, symbol: str, interval: str = "1d", limit: int = 252) -> dict:
        """获取K线数据"""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}/api/kline",
                params={"symbol": symbol, "interval": interval, "limit": limit}
            )
            return response.json()
    
    async def sync_kline(self, symbol: str, interval: str, data: List[dict]) -> dict:
        """同步K线数据到数据库"""
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/api/admin/kline/sync",
                json={"symbol": symbol, "interval": interval, "data": data}
            )
            return response.json()

data_api = DataAPIClient()
```

- [ ] **Step 3: 实现 K线同步任务**

```python
# services/scheduler/app/jobs/sync_kline.py
import logging
from datetime import datetime, timedelta
from ..clients.backend_api import backend_api
from ..clients.data_api import data_api

logger = logging.getLogger(__name__)

async def sync_watchlist_klines():
    """同步所有自选标的 K线数据"""
    logger.info("Starting watchlist klines sync...")
    
    try:
        # 1. 获取所有自选标的
        symbols = await backend_api.get_watchlist_symbols()
        logger.info(f"Found {len(symbols)} watchlist symbols")
        
        # 2. 同步每个标的的前一日 K线
        for symbol in symbols:
            try:
                await sync_single_symbol(symbol)
            except Exception as e:
                logger.error(f"Failed to sync {symbol}: {e}")
        
        logger.info("Watchlist klines sync completed")
        
    except Exception as e:
        logger.error(f"Watchlist klines sync failed: {e}")

async def sync_single_symbol(symbol: str, days: int = 252):
    """同步单个标的的历史K线（默认1年）"""
    logger.info(f"Syncing {symbol} klines...")
    
    # 获取K线数据
    kline_response = await data_api.get_kline(symbol, "1d", days)
    
    if kline_response.get("data"):
        # 写入数据库
        sync_response = await data_api.sync_kline(
            symbol=symbol,
            interval="1d",
            data=kline_response["data"]
        )
        
        logger.info(f"Synced {symbol}: {sync_response.get('count')} records")
    else:
        logger.warning(f"No data found for {symbol}")
```

- [ ] **Step 4: 初始化 jobs 包**

```python
# services/scheduler/app/jobs/__init__.py
from .sync_kline import sync_watchlist_klines, sync_single_symbol

__all__ = ['sync_watchlist_klines', 'sync_single_symbol']
```

- [ ] **Step 5: 初始化 clients 包**

```python
# services/scheduler/app/clients/__init__.py
from .backend_api import backend_api, BackendAPIClient
from .data_api import data_api, DataAPIClient

__all__ = ['backend_api', 'BackendAPIClient', 'data_api', 'DataAPIClient']
```

- [ ] **Step 6: 提交**

```bash
git add services/scheduler/
git commit -m "feat: implement kline sync job and API clients"
```

---

### Task 16: 添加定时任务服务到 docker-compose

**Files:**
- Modify: `docker-compose.yml`

- [ ] **Step 1: 更新 docker-compose.yml**

```yaml
# 添加 scheduler 服务
  scheduler:
    build: ./services/scheduler
    container_name: trading-agent-scheduler
    ports:
      - "8001:8001"
    environment:
      - BACKEND_API_URL=http://backend:3002
      - DATA_API_URL=http://market-data:8000
    depends_on:
      - backend
      - market-data
    restart: unless-stopped
```

- [ ] **Step 2: 更新 market-data 服务名**

```yaml
# 修改 market-data 服务名，让 scheduler 可以引用
  market-data:
    build: ./services/market-data
    container_name: trading-agent-market-data
    # ...
```

- [ ] **Step 3: 提交**

```bash
git add docker-compose.yml
git commit -m "feat: add scheduler service to docker-compose"
```

---

## Phase 5: 后端集成

### Task 17: 后端添加 webhook 接口

**Files:**
- Modify: `backend/src/routes/webhook.ts`
- Modify: `backend/src/index.ts`

- [ ] **Step 1: 创建 webhook 路由**

```typescript
// backend/src/routes/webhook.ts
import { Hono } from 'hono'
import { z } from 'zod'

const webhook = new Hono()

const watchlistAddedSchema = z.object({
  symbol: z.string(),
  groupId: z.string(),
})

// 定时任务服务会调用这个 webhook
webhook.post('/watchlist/added', async (c) => {
  const body = await c.req.json()
  const { symbol } = watchlistAddedSchema.parse(body)
  
  // TODO: 调用定时任务服务触发历史数据同步
  // await fetch(`${SCHEDULER_URL}/webhook/watchlist/added`, {
  //   method: 'POST',
  //   body: JSON.stringify({ symbol }),
  // })
  
  return c.json({ status: 'scheduled', symbol })
})

export { webhook }
```

- [ ] **Step 2: 注册路由**

```typescript
// backend/src/index.ts
import { authRoutes } from './routes/auth'
import { watchlistRoutes } from './routes/watchlist'
import { webhook } from './routes/webhook'

// ... 现有代码 ...

app.route('/api/auth', authRoutes)
app.route('/api/watchlist', watchlistRoutes)
app.route('/webhook', webhook)  // 添加 webhook 路由
```

- [ ] **Step 3: 提交**

```bash
git add backend/src/
git commit -m "feat: add webhook route for watchlist events"
```

---

## 验收测试

### Task 18: 端到端测试

**Files:**
- Create: `services/market-data/tests/test_api.py`

- [ ] **Step 1: 启动所有服务**

```bash
# 启动基础设施
docker-compose up -d postgres redis

# 启动数据服务
cd services/market-data
python -m app.main

# 启动定时任务服务
cd services/scheduler
python -m app.main

# 启动后端
cd backend
pnpm dev:api
```

- [ ] **Step 2: 测试 API**

```bash
# 测试健康检查
curl http://localhost:8000/health

# 测试获取美股行情
curl http://localhost:8000/api/quote?symbol=AAPL

# 测试获取A股行情
curl http://localhost:8000/api/quote?symbol=000001

# 测试批量行情
curl http://localhost:8000/api/quotes?symbols=AAPL,TSLA,000001

# 测试K线数据
curl http://localhost:8000/api/kline?symbol=AAPL&interval=1d&limit=10

# 测试技术指标
curl http://localhost:8000/api/indicators?symbol=AAPL&indicators=MA,MACD,RSI
```

- [ ] **Step 3: 验证缓存**

```bash
# 第二次请求应该更快（命中缓存）
time curl http://localhost:8000/api/quote?symbol=AAPL
```

- [ ] **Step 4: 验证前端集成**

```bash
# 启动前端
cd frontend
pnpm dev

# 访问 http://localhost:3000
# 检查自选列表是否显示（虽然有模拟数据，但服务应该正常响应）
```

- [ ] **Step 5: 提交**

```bash
git add services/market-data/tests/
git commit -m "test: add end-to-end tests"
```

---

## 任务完成检查

- [ ] **数据服务能启动并响应 API**
- [ ] **能获取美股 (AAPL)、A股 (000001) 的实时行情**
- [ ] **能获取 K线数据**
- [ ] **能计算技术指标 (MA, EMA, MACD, RSI, KDJ, BB)**
- [ ] **Redis 缓存正常工作**
- [ ] **TimescaleDB 表结构已创建**
- [ ] **定时任务服务能启动**
- [ ] **docker-compose 能启动所有服务**
- [ ] **前端能调用数据服务 API**

---

**预计工时:** 4-5 天

**风险提示:**
1. AkShare 数据可能不稳定，需要多次重试
2. TimescaleDB 需要 PostgreSQL 扩展支持
3. 技术指标计算可能需要调整参数
4. A股代码格式需要处理好（000001 vs 000001.SZ）

**后续优化:**
1. 添加更多数据源（腾讯、mootdx）
2. 实现价格提醒扫描
3. 添加 AI 市场雷达
4. K线图表可视化
