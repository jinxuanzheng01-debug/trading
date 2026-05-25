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
