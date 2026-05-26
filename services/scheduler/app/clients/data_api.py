"""
数据服务 API 客户端 - 获取K线数据和同步
"""
import httpx
import logging
from typing import List, Dict, Any, Optional
from ..config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class DataAPIClient:
    """数据服务 API 客户端"""

    def __init__(self, base_url: Optional[str] = None):
        self.base_url = base_url or settings.data_api_url

    async def get_kline(
        self, symbol: str, interval: str = "1d", limit: int = 252
    ) -> Dict[str, Any]:
        """获取K线数据"""
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(
                    f"{self.base_url}/api/kline",
                    params={"symbol": symbol, "interval": interval, "limit": limit},
                )
                response.raise_for_status()
                return response.json()
        except httpx.HTTPError as e:
            logger.error(f"Failed to fetch kline data for {symbol}: {e}")
            return {"data": []}

    async def sync_kline(
        self, symbol: str, interval: str, data: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """同步K线数据到 Backend API 的 stock_quote_history 表"""
        try:
            backend_url = getattr(settings, 'backend_api_url', 'http://api:4000')
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    f"{backend_url}/api/internal/klines/sync",
                    json={"symbol": symbol, "interval": interval, "data": data},
                )
                response.raise_for_status()
                return response.json()
        except httpx.HTTPError as e:
            logger.error(f"Failed to sync kline data for {symbol}: {e}")
            return {"success": False, "error": str(e)}

    async def get_quotes(self, symbols: List[str]) -> List[Dict[str, Any]]:
        """批量获取股票报价"""
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(
                    f"{self.base_url}/api/quotes",
                    params={"symbols": ",".join(symbols)},
                )
                response.raise_for_status()
                result = response.json()
                return result.get("data", [])
        except httpx.HTTPError as e:
            logger.error(f"Failed to fetch quotes for {symbols}: {e}")
            return []


data_api = DataAPIClient()
