"""通过 market-data API 获取 K-line 数据。"""

from __future__ import annotations

import httpx
import pandas as pd

from ..config import get_settings


class DataFetcher:
    """从 market-data 服务获取 K-line 数据。"""

    def __init__(self):
        settings = get_settings()
        self.base_url = settings.market_data_url
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
                f"{self.base_url}/api/kline",
                params={"symbol": symbol, "interval": interval, "limit": limit},
                headers={"Authorization": f"Bearer {self.token}"},
            )
            resp.raise_for_status()
            data = resp.json()

        klines = data.get("data", [])
        if not klines:
            raise ValueError(f"No kline data for {symbol}")

        df = pd.DataFrame(klines)
        # 转换列名和数据类型
        df["time"] = pd.to_datetime(df["time"], utc=True)
        df.set_index("time", inplace=True)
        for col in ["open", "high", "low", "close", "volume"]:
            df[col] = df[col].astype(float)

        return df
