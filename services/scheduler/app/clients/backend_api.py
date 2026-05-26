"""
后端 API 客户端 - 获取自选列表
"""
import httpx
import logging
from typing import List, Optional
from ..config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class BackendAPIClient:
    """后端 API 客户端 - 获取自选列表"""

    def __init__(self, base_url: Optional[str] = None):
        self.base_url = base_url or settings.backend_api_url

    async def get_watchlist_symbols(self) -> List[str]:
        """获取所有自选标的代码"""
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(
                    f"{self.base_url}/api/watchlist/items"
                )
                response.raise_for_status()
                items = response.json().get("items", [])
                symbols = [item.get("symbol") for item in items if item.get("symbol")]
                logger.info(f"Fetched {len(symbols)} symbols from backend API")
                return symbols
        except httpx.HTTPError as e:
            logger.error(f"Failed to fetch watchlist symbols: {e}")
            return []

    async def update_quotes_cache(self, quotes: List[dict]) -> dict:
        """批量更新报价缓存"""
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    f"{self.base_url}/api/internal/quotes/batch-update",
                    json=quotes,
                )
                response.raise_for_status()
                return response.json()
        except httpx.HTTPError as e:
            logger.error(f"Failed to update quotes cache: {e}")
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
