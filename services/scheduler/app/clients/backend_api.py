"""
后端 API 客户端 - 写 PG 入口（K线、报价、基本面）
"""
import httpx
import logging
from typing import List, Optional
from ..config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


def is_a_stock(symbol: str) -> bool:
    """A股：6位数字"""
    return symbol.isdigit() and len(symbol) == 6


def is_hk_stock(symbol: str) -> bool:
    """港股：<=5位数字"""
    return symbol.isdigit() and len(symbol) <= 5


def is_us_stock(symbol: str) -> bool:
    """美股：非A股非港股即美股"""
    return not is_a_stock(symbol) and not is_hk_stock(symbol)


class BackendAPIClient:
    """后端 API 客户端 — 数据写入 PG 的入口"""

    def __init__(self, base_url: Optional[str] = None):
        self.base_url = base_url or settings.backend_api_url

    async def sync_kline(self, symbol: str, interval: str, data: list[dict]) -> dict:
        """同步K线数据到 klines 表"""
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    f"{self.base_url}/api/internal/klines/sync",
                    json={"symbol": symbol, "interval": interval, "data": data},
                )
                response.raise_for_status()
                return response.json()
        except httpx.HTTPError as e:
            logger.error(f"Failed to sync kline data for {symbol}: {e}")
            return {"success": False, "error": str(e)}

    async def sync_quotes(self, quotes: List[dict]) -> dict:
        """批量同步报价到 PG（stock_quotes + quote_snapshots）"""
        try:
            payload = {
                "quotes": [
                    {
                        "symbol": q.get("symbol"),
                        "price": q.get("price", 0),
                        "change": q.get("change", 0),
                        "changePercent": q.get("changePercent", 0),
                        "open": q.get("open"),
                        "high": q.get("high"),
                        "low": q.get("low"),
                        "volume": q.get("volume", 0),
                        "prevClose": q.get("previousClose", q.get("prevClose")),
                        "marketCap": q.get("marketCap", 0),
                        "currency": q.get("currency", "USD"),
                    }
                    for q in quotes
                ]
            }
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    f"{self.base_url}/api/internal/quotes/sync",
                    json=payload,
                    headers={"X-Service-Token": settings.service_token},
                )
                response.raise_for_status()
                return response.json()
        except httpx.HTTPError as e:
            logger.error(f"Failed to sync quotes: {e}")
            return {"success": False, "error": str(e)}

    async def get_all_stock_symbols(self) -> List[str]:
        """获取 stocks 表中所有股票代码（不再依赖自选股列表）"""
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    f"{self.base_url}/api/internal/stocks/symbols"
                )
                response.raise_for_status()
                symbols = response.json().get("symbols", [])
                logger.info(f"Fetched {len(symbols)} symbols from stocks table")
                return symbols
        except httpx.HTTPError as e:
            logger.error(f"Failed to fetch stock symbols: {e}")
            return []

    async def sync_fundamentals(self, symbols: List[str]) -> dict:
        """同步基本面数据（PE、EPS 等）到 stock_fundamentals 表"""
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    f"{self.base_url}/api/internal/fundamentals/sync",
                    json={"symbols": symbols},
                    headers={"X-Service-Token": settings.service_token},
                )
                response.raise_for_status()
                return response.json()
        except httpx.HTTPError as e:
            logger.error(f"Failed to sync fundamentals: {e}")
            return {"success": False, "error": str(e)}

    async def get_latest_kline(self, symbol: str, interval: str) -> dict:
        """查询本地最新K线日期"""
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    f"{self.base_url}/api/internal/klines/latest",
                    params={"symbol": symbol, "interval": interval},
                )
                response.raise_for_status()
                return response.json()
        except httpx.HTTPError as e:
            logger.error(f"Failed to get latest kline for {symbol}/{interval}: {e}")
            return {"latest_at": None}


backend_api = BackendAPIClient()
