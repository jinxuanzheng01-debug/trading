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


backend_api = BackendAPIClient()
