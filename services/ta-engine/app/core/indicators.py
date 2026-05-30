"""TA-Lib 指标计算封装。

输入 pandas DataFrame（含 open/high/low/close/volume 列），
输出 dict 形式的最新指标值快照。
"""

from __future__ import annotations

import talib
import numpy as np
import pandas as pd
from typing import Dict, List, Optional


class IndicatorsCalculator:
    """基于 TA-Lib 的技术指标计算器。"""

    def __init__(self, df: pd.DataFrame):
        self.df = df
        self._open = df["open"].values.astype(float)
        self._high = df["high"].values.astype(float)
        self._low = df["low"].values.astype(float)
        self._close = df["close"].values.astype(float)
        self._volume = df["volume"].values.astype(float)

    def _last(self, arr: np.ndarray) -> Optional[float]:
        """取最后一个非 NaN 值。"""
        val = arr[-1]
        return float(val) if np.isfinite(val) else None

    def compute_ma(self, periods: List[int] = None) -> Dict[str, Optional[float]]:
        periods = periods or [5, 10, 20, 60]
        result = {}
        for p in periods:
            ma = talib.MA(self._close, timeperiod=p)
            result[f"MA{p}"] = self._last(ma)
        return result

    def compute_ema(self, periods: List[int] = None) -> Dict[str, Optional[float]]:
        periods = periods or [12, 26]
        result = {}
        for p in periods:
            ema = talib.EMA(self._close, timeperiod=p)
            result[f"EMA{p}"] = self._last(ema)
        return result

    def compute_rsi(self, periods: List[int] = None) -> Dict[str, Optional[float]]:
        periods = periods or [6, 14, 24]
        result = {}
        for p in periods:
            rsi = talib.RSI(self._close, timeperiod=p)
            result[f"RSI{p}"] = self._last(rsi)
        return result

    def compute_macd(
        self, fast: int = 12, slow: int = 26, signal: int = 9
    ) -> Dict[str, Optional[float]]:
        macd, macd_signal, macd_hist = talib.MACD(
            self._close, fastperiod=fast, slowperiod=slow, signalperiod=signal
        )
        return {
            "MACD": self._last(macd),
            "Signal": self._last(macd_signal),
            "Histogram": self._last(macd_hist),
        }

    def compute_atr(self, period: int = 14) -> Dict[str, Optional[float]]:
        atr = talib.ATR(self._high, self._low, self._close, timeperiod=period)
        return {f"ATR{period}": self._last(atr)}

    def compute_bollinger(
        self, period: int = 20, std_dev: float = 2.0
    ) -> Dict[str, Optional[float]]:
        upper, mid, lower = talib.BBANDS(
            self._close, timeperiod=period, nbdevup=std_dev, nbdevdn=std_dev
        )
        return {
            "BB_upper": self._last(upper),
            "BB_mid": self._last(mid),
            "BB_lower": self._last(lower),
        }

    def compute_obv(self) -> Dict[str, Optional[float]]:
        obv = talib.OBV(self._close, self._volume)
        return {"OBV": self._last(obv)}

    def compute_adx(self, period: int = 14) -> Dict[str, Optional[float]]:
        adx = talib.ADX(self._high, self._low, self._close, timeperiod=period)
        plus_di = talib.PLUS_DI(self._high, self._low, self._close, timeperiod=period)
        minus_di = talib.MINUS_DI(self._high, self._low, self._close, timeperiod=period)
        return {
            f"ADX{period}": self._last(adx),
            f"PLUS_DI{period}": self._last(plus_di),
            f"MINUS_DI{period}": self._last(minus_di),
        }

    def compute_kdj(
        self, n: int = 9, m1: int = 3, m2: int = 3
    ) -> Dict[str, Optional[float]]:
        slowk, slowd = talib.STOCH(
            self._high, self._low, self._close,
            fastk_period=n, slowk_period=m1, slowd_period=m2,
        )
        k = self._last(slowk)
        d = self._last(slowd)
        j = 3 * k - 2 * d if k is not None and d is not None else None
        return {"K": k, "D": d, "J": j}

    def compute_candlestick_patterns(self) -> Dict[str, int | float]:
        """识别所有 TA-Lib K 线形态，返回看涨/看跌计数和综合得分。"""
        pattern_funcs = [name for name in dir(talib) if name.startswith("CDL")]
        bullish_count = 0
        bearish_count = 0

        for func_name in pattern_funcs:
            func = getattr(talib, func_name)
            result = func(self._open, self._high, self._low, self._close)
            last_val = result[-1]
            if last_val > 0:
                bullish_count += 1
            elif last_val < 0:
                bearish_count += 1

        pattern_score = bullish_count - bearish_count
        return {
            "pattern_score": pattern_score,
            "bullish_count": bullish_count,
            "bearish_count": bearish_count,
        }

    def compute_all(self) -> Dict[str, any]:
        """计算所有指标，返回合并字典。"""
        result = {}
        result.update(self.compute_ma())
        result.update(self.compute_ema())
        result.update(self.compute_rsi())
        result.update(self.compute_macd())
        result.update(self.compute_atr())
        result.update(self.compute_bollinger())
        result.update(self.compute_obv())
        result.update(self.compute_adx())
        result.update(self.compute_kdj())
        result.update(self.compute_candlestick_patterns())
        return result
