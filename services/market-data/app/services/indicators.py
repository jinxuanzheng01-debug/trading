import pandas as pd
import pandas_ta as ta
from typing import List, Dict, Optional
from ..api.models import KlineData


class IndicatorsCalculator:
    """技术指标计算器"""

    def __init__(self, klines: List[KlineData]):
        self.df = self._klines_to_df(klines)

    def _klines_to_df(self, klines: List[KlineData]) -> pd.DataFrame:
        """将 K线数据转换为 DataFrame"""
        data = {
            'time': [k.time for k in klines],
            'open': [k.open for k in klines],
            'high': [k.high for k in klines],
            'low': [k.low for k in klines],
            'close': [k.close for k in klines],
            'volume': [k.volume for k in klines],
        }
        df = pd.DataFrame(data)
        df['time'] = pd.to_datetime(df['time'], utc=True)
        df.set_index('time', inplace=True)
        return df

    def calculate_ma(self, periods: List[int] = [5, 10, 20, 60]) -> Dict[str, Optional[float]]:
        """计算移动平均线 MA"""
        result = {}
        for period in periods:
            ma = self.df['close'].rolling(window=period).mean().iloc[-1]
            result[f'MA{period}'] = float(ma) if pd.notna(ma) else None
        return result

    def calculate_ema(self, periods: List[int] = [12, 26]) -> Dict[str, Optional[float]]:
        """计算指数移动平均 EMA"""
        result = {}
        for period in periods:
            ema = self.df['close'].ewm(span=period).mean().iloc[-1]
            result[f'EMA{period}'] = float(ema) if pd.notna(ema) else None
        return result

    def calculate_macd(self, fast: int = 12, slow: int = 26, signal: int = 9) -> Dict[str, Optional[float]]:
        """计算 MACD"""
        macd_df = ta.macd(self.df['close'], fast=fast, slow=slow, signal=signal)
        if macd_df is not None and not macd_df.empty:
            last = macd_df.iloc[-1]
            return {
                'MACD': float(last[f'MACD_{fast}_{slow}_{signal}']) if pd.notna(last[f'MACD_{fast}_{slow}_{signal}']) else None,
                'Signal': float(last[f'MACDs_{fast}_{slow}_{signal}']) if pd.notna(last[f'MACDs_{fast}_{slow}_{signal}']) else None,
                'Histogram': float(last[f'MACDh_{fast}_{slow}_{signal}']) if pd.notna(last[f'MACDh_{fast}_{slow}_{signal}']) else None,
            }
        return {'MACD': None, 'Signal': None, 'Histogram': None}

    def calculate_rsi(self, periods: List[int] = [6, 12, 24]) -> Dict[str, Optional[float]]:
        """计算 RSI"""
        result = {}
        for period in periods:
            rsi_series = ta.rsi(self.df['close'], length=period)
            if rsi_series is not None and len(rsi_series) > 0:
                last_val = rsi_series.iloc[-1] if hasattr(rsi_series, 'iloc') else rsi_series
                result[f'RSI{period}'] = float(last_val) if pd.notna(last_val) else None
        return result

    def calculate_kdj(self, n: int = 9, m1: int = 3, m2: int = 3) -> Dict[str, Optional[float]]:
        """计算 KDJ"""
        low = self.df['low'].rolling(window=n).min()
        high = self.df['high'].rolling(window=n).max()
        rsv = (self.df['close'] - low) / (high - low) * 100

        k = rsv.ewm(com=1 / m1, adjust=False).mean()
        d = k.ewm(com=1 / m2, adjust=False).mean()
        j = 3 * k - 2 * d

        return {
            'K': float(k.iloc[-1]) if pd.notna(k.iloc[-1]) else None,
            'D': float(d.iloc[-1]) if pd.notna(d.iloc[-1]) else None,
            'J': float(j.iloc[-1]) if pd.notna(j.iloc[-1]) else None,
        }

    def calculate_bollinger_bands(self, period: int = 20, std_dev: int = 2) -> Dict[str, Optional[float]]:
        """计算布林带"""
        bb = ta.bollinger_bands(self.df['close'], length=period, std=std_dev)
        if bb is not None and not bb.empty:
            last = bb.iloc[-1]
            return {
                'upper': float(last[f'BBL_{period}_{std_dev}.0']) if pd.notna(last[f'BBL_{period}_{std_dev}.0']) else None,
                'middle': float(last[f'BBM_{period}_{std_dev}.0']) if pd.notna(last[f'BBM_{period}_{std_dev}.0']) else None,
                'lower': float(last[f'BBU_{period}_{std_dev}.0']) if pd.notna(last[f'BBU_{period}_{std_dev}.0']) else None,
                'bandwidth': None,
            }
        return {'upper': None, 'middle': None, 'lower': None, 'bandwidth': None}

    def calculate_all(self, indicator_list: List[str]) -> Dict:
        """计算所有请求的指标（大小写不敏感）"""
        result = {}
        upper = [i.upper() for i in indicator_list]

        if 'MA' in upper or 'all' in upper:
            result['MA'] = self.calculate_ma()
        if 'EMA' in upper or 'all' in upper:
            result['EMA'] = self.calculate_ema()
        if 'MACD' in upper or 'all' in upper:
            result['MACD'] = self.calculate_macd()
        if 'RSI' in upper or 'all' in upper:
            result['RSI'] = self.calculate_rsi()
        if 'KDJ' in upper or 'all' in upper:
            result['KDJ'] = self.calculate_kdj()
        if 'BB' in upper or 'BOLLINGER' in upper or 'all' in upper:
            result['BB'] = self.calculate_bollinger_bands()

        return result
