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
            name=info.get("longName") or info.get("shortName"),
            price=current_price,
            change=current_price - previous_close,
            changePercent=((current_price - previous_close) / previous_close * 100) if previous_close else 0,
            volume=int(info.get("volume", 0)),
            high=fast_info.day_high,
            low=fast_info.day_low,
            open=fast_info.day_open,
            previousClose=previous_close,
            marketCap=info.get("marketCap"),
            currency=info.get("currency", "USD"),
            timestamp=datetime.utcnow().isoformat()
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
            "1h": "1h", "4h": "4h", "1d": "1d", "1w": "1wk", "1M": "1mo"
        }
        yf_interval = interval_map.get(interval, "1d")

        end = end_date or datetime.now()
        start = start_date or (end - timedelta(days=limit * 2))

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
                time=timestamp.to_pydatetime().isoformat(),
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
        return True
