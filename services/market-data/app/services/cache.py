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
