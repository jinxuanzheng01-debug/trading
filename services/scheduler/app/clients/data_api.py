"""
数据服务 API 客户端 - 从 market-data 拉取数据
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
        self, symbol: str, interval: str = "1d", limit: int = None,
        start: str = None,
    ) -> Dict[str, Any]:
        """获取K线数据。limit=None + start 时返回全部历史数据。"""
        try:
            params = {"symbol": symbol, "interval": interval}
            if limit is not None:
                params["limit"] = limit
            if start:
                params["start"] = start
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(
                    f"{self.base_url}/api/kline",
                    params=params,
                )
                response.raise_for_status()
                return response.json()
        except httpx.HTTPError as e:
            logger.error(f"Failed to fetch kline data for {symbol}: {e}")
            return {"data": []}

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
