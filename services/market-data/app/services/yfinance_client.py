import yfinance as yf
import asyncio
from typing import List, Optional
from datetime import datetime, timedelta
import pandas as pd

from .base_client import BaseStockDataProvider
from ..api.models import QuoteData, KlineData
from ..config import get_settings

settings = get_settings()


def safe_float(value, default=0.0):
    """Safely convert value to float, handling Timestamp and None"""
    if value is None:
        return default
    # Don't convert Timestamp to timestamp - skip Timestamp values entirely
    if isinstance(value, pd.Timestamp):
        return default  # Return default for Timestamp objects
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


class YFinanceClient(BaseStockDataProvider):
    """yfinance 数据源客户端 - 支持美股、港股"""

    def __init__(self):
        self.timeout = settings.yfinance_timeout
        self.max_retries = settings.yfinance_max_retries

    async def get_quote(self, symbol: str) -> QuoteData:
        try:
            ticker = await asyncio.to_thread(self._get_ticker, symbol)
            info = await asyncio.to_thread(lambda: ticker.info)
            fast_info = await asyncio.to_thread(lambda: ticker.fast_info)

            current_price = fast_info.last_price
            previous_close = fast_info.previous_close

            # Safely get numeric values with defaults
            price = safe_float(current_price)
            prev_close = safe_float(previous_close, price)

            # Get open price from info dict if fast_info doesn't have it
            open_price = price  # Default to current price
            if hasattr(fast_info, 'day_open') and fast_info.day_open is not None:
                open_price = safe_float(fast_info.day_open, price)
            elif 'regularMarketOpen' in info and info['regularMarketOpen'] is not None:
                open_price = safe_float(info['regularMarketOpen'], price)
            elif 'open' in info and info['open'] is not None:
                open_price = safe_float(info['open'], price)

            high = safe_float(fast_info.day_high, price) if hasattr(fast_info, 'day_high') and fast_info.day_high is not None else price
            low = safe_float(fast_info.day_low, price) if hasattr(fast_info, 'day_low') and fast_info.day_low is not None else price
            market_cap = info.get("marketCap")
            volume = int(info.get("volume", 0)) if info.get("volume") else 0

            return QuoteData(
                symbol=symbol,
                name=info.get("longName") or info.get("shortName") or symbol,
                price=price,
                change=price - prev_close,
                changePercent=((price - prev_close) / prev_close * 100) if prev_close and prev_close != 0 else 0.0,
                volume=volume,
                high=high,
                low=low,
                open=open_price,
                previousClose=prev_close,
                marketCap=float(market_cap) if market_cap else None,
                currency=info.get("currency", "USD"),
                timestamp=datetime.utcnow().isoformat()
            )
        except Exception as e:
            print(f"Error fetching quote for {symbol}: {e}")
            # Return minimal data on error
            return QuoteData(
                symbol=symbol,
                name=symbol,
                price=0.0,
                change=0.0,
                changePercent=0.0,
                volume=0,
                high=0.0,
                low=0.0,
                open=0.0,
                previousClose=0.0,
                marketCap=None,
                currency="USD",
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

        # start/end 可能直接从 API 传入（字符串或 datetime）
        if isinstance(start_date, str) and start_date:
            start_date = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
        if isinstance(end_date, str) and end_date:
            end_date = datetime.fromisoformat(end_date.replace('Z', '+00:00'))

        end = end_date or datetime.now()

        if not start_date:
            # Use generous lookback to ensure we get enough bars
            lookback_map = {
                "1d": timedelta(days=limit * 2),
                "1w": timedelta(days=limit * 10),
                "1M": timedelta(days=limit * 40),
            }
            start = end - lookback_map.get(interval, timedelta(days=limit * 2))
        else:
            start = start_date

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

    async def get_kline_batch(
        self,
        symbols: list[str],
        interval: str,
        limit: int,
        start_date: str = None,
        end_date: str = None,
    ) -> dict[str, list[KlineData]]:
        """批量获取多只股票的K线数据，使用 yfinance download 一次拉取"""
        interval_map = {
            "1m": "1m", "5m": "5m", "15m": "15m", "30m": "30m",
            "1h": "1h", "4h": "4h", "1d": "1d", "1w": "1wk", "1M": "1mo"
        }
        yf_interval = interval_map.get(interval, "1d")

        from datetime import datetime, timedelta
        end = end_date or datetime.now().strftime("%Y-%m-%d")
        start = start_date or (datetime.now() - timedelta(days=limit * 2)).strftime("%Y-%m-%d")

        # yfinance.download 一次拉多只
        df = await asyncio.to_thread(
            lambda: yf.download(
                tickers=" ".join(symbols),
                interval=yf_interval,
                start=start,
                end=end,
                group_by="ticker",
                progress=False,
            )
        )

        result: dict[str, list[KlineData]] = {}

        # 处理单只股票的情况（yfinance 返回格式不同）
        if len(symbols) == 1:
            sym = symbols[0]
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
            result[sym] = klines
        else:
            for sym in symbols:
                if sym not in df.columns.levels[0]:
                    continue
                sym_df = df[sym].dropna()
                klines = []
                for timestamp, row in sym_df.tail(limit).iterrows():
                    klines.append(KlineData(
                        time=timestamp.to_pydatetime().isoformat(),
                        open=float(row['Open']),
                        high=float(row['High']),
                        low=float(row['Low']),
                        close=float(row['Close']),
                        volume=int(row['Volume'])
                    ))
                result[sym] = klines

        return result

    def _get_ticker(self, symbol: str):
        """同步获取 ticker 对象"""
        return yf.Ticker(symbol)

    def supports_market(self, symbol: str) -> bool:
        """判断是否支持该市场"""
        return True
