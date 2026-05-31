"""通过 Backend API 获取 K-line 数据（读 PG，不穿透 yfinance）。"""

from __future__ import annotations

import httpx
import pandas as pd

from ..config import get_settings


class DataFetcher:
    """从 Backend API（PG）获取 K-line 数据。"""

    def __init__(self):
        settings = get_settings()
        self.base_url = settings.backend_api_url
        self.token = settings.service_token

    async def fetch_kline(
        self,
        symbol: str,
        interval: str = "1d",
        limit: int = 250,
    ) -> pd.DataFrame:
        """获取 K-line 数据并转为 DataFrame。

        Args:
            symbol: 股票代码
            interval: K 线周期 (1d/1w/1M)
            limit: 获取数量

        Returns:
            DataFrame with columns: open, high, low, close, volume, DatetimeIndex
        """
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(
                f"{self.base_url}/api/stock/{symbol}/kline",
                params={"interval": interval, "limit": limit},
            )
            resp.raise_for_status()
            body = resp.json()

        # API 格式: { code, data: { data: [...] } }
        klines = body.get("data", {}).get("data", [])
        if not klines:
            raise ValueError(f"No kline data for {symbol}")

        df = pd.DataFrame(klines)
        df["time"] = pd.to_datetime(df["timestamp"], utc=True)
        df.set_index("time", inplace=True)
        for col in ["open", "high", "low", "close", "volume"]:
            df[col] = df[col].astype(float)

        return df
