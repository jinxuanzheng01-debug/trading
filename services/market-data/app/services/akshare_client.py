import akshare as ak
import asyncio
import pandas as pd
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
        start = start_date or (end - timedelta(days=365))

        start_str = start.strftime("%Y%m%d")
        end_str = end.strftime("%Y%m%d")

        if self._is_a_stock(symbol):
            df = await asyncio.to_thread(
                lambda: ak.stock_zh_a_hist(
                    symbol=symbol,
                    period="daily",
                    start_date=start_str,
                    end_date=end_str,
                    adjust=""
                )
            )
        elif self._is_hk_stock(symbol):
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
        return symbol.isdigit() and len(symbol) == 6

    def _is_hk_stock(self, symbol: str) -> bool:
        """判断是否为港股"""
        return symbol.isdigit() and len(symbol) <= 5

    def supports_market(self, symbol: str) -> bool:
        """判断是否支持该市场"""
        return self._is_a_stock(symbol) or self._is_hk_stock(symbol)
