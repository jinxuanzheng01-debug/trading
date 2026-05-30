"""15 个时序因子计算。

因子 = 指标经过标准算子组合后的标准化值。
每个因子有 theme 标签和 min_warmup_bars。
"""

from __future__ import annotations

from typing import Dict, Optional

import numpy as np
import pandas as pd
import talib

from .indicators import IndicatorsCalculator
from .operators import ts_mean, ts_std, ts_rank, ts_corr, delta, safe_div


class FactorCalculator:
    """因子计算器：输入 OHLCV DataFrame，输出因子值字典。"""

    def __init__(self, df: pd.DataFrame):
        self.df = df
        self.close = df["close"]
        self.open_ = df["open"]
        self.high = df["high"]
        self.low = df["low"]
        self.volume = df["volume"]
        # 预计算指标值快照
        self._indicators_calc = IndicatorsCalculator(df)
        self._indicator_values = self._indicators_calc.compute_all()

        # 预提取 numpy 数组供 TA-Lib 使用
        self._c = self.close.values.astype(float)
        self._o = self.open_.values.astype(float)
        self._h = self.high.values.astype(float)
        self._l = self.low.values.astype(float)
        self._v = self.volume.values.astype(float)

    def _series(self, name: str, **kwargs) -> pd.Series:
        """获取指标的时间序列（而非最新值快照）。"""
        if name == "RSI":
            return pd.Series(talib.RSI(self._c, timeperiod=kwargs.get("period", 14)), index=self.df.index)
        elif name == "MACD_HIST":
            _, _, hist = talib.MACD(self._c)
            return pd.Series(hist, index=self.df.index)
        elif name == "EMA":
            return pd.Series(talib.EMA(self._c, timeperiod=kwargs.get("period", 12)), index=self.df.index)
        elif name == "OBV":
            return pd.Series(talib.OBV(self._c, self._v), index=self.df.index)
        elif name == "ATR":
            return pd.Series(talib.ATR(self._h, self._l, self._c, timeperiod=kwargs.get("period", 14)), index=self.df.index)
        elif name == "KDJ_J":
            slowk, slowd = talib.STOCH(self._h, self._l, self._c)
            j = 3 * slowk - 2 * slowd
            return pd.Series(j, index=self.df.index)
        else:
            raise ValueError(f"Unknown indicator series: {name}")

    def _safe_last(self, s: pd.Series) -> Optional[float]:
        val = s.iloc[-1]
        return float(val) if pd.notna(val) and np.isfinite(val) else None

    # --- 15 个因子实现 ---

    def momentum_short(self) -> Optional[float]:
        """短期动量：delta(close, 5) / ts_std(close, 20)"""
        d = delta(self.close, 5)
        std = ts_std(self.close, 20)
        result = safe_div(d, std)
        return self._safe_last(result)

    def momentum_mid_rank(self) -> Optional[float]:
        """中期动量排名：ts_rank(close / ts_mean(close, 60), 20)"""
        ratio = safe_div(self.close, ts_mean(self.close, 60))
        return self._safe_last(ts_rank(ratio, 20))

    def rsi_deviation(self) -> Optional[float]:
        """RSI 偏离加速度：delta(RSI, 3) / ts_std(RSI, 30)"""
        rsi = self._series("RSI", period=14)
        d = delta(rsi, 3)
        std = ts_std(rsi, 30)
        return self._safe_last(safe_div(d, std))

    def macd_hist_momentum(self) -> Optional[float]:
        """MACD 柱状图动量：delta(MACD_hist, 1) / ts_std(MACD_hist, 20)"""
        hist = self._series("MACD_HIST")
        d = delta(hist, 1)
        std = ts_std(hist, 20)
        return self._safe_last(safe_div(d, std))

    def volume_price_corr(self) -> Optional[float]:
        """量价相关因子：ts_corr(delta(close,1), delta(volume,1), 10)"""
        price_d = delta(self.close, 1)
        vol_d = delta(self.volume, 1)
        return self._safe_last(ts_corr(price_d, vol_d, 10))

    def volume_ratio(self) -> Optional[float]:
        """量能偏离：volume / ts_mean(volume, 20)"""
        vol_ma = ts_mean(self.volume, 20)
        return self._safe_last(safe_div(self.volume, vol_ma))

    def obv_trend(self) -> Optional[float]:
        """OBV 趋势强度：delta(OBV, 10) / ts_std(OBV, 20)"""
        obv = self._series("OBV")
        d = delta(obv, 10)
        std = ts_std(obv, 20)
        return self._safe_last(safe_div(d, std))

    def volatility_compression(self) -> Optional[float]:
        """波动率压缩：ts_std(close, 10) / ts_std(close, 60)"""
        std_short = ts_std(self.close, 10)
        std_long = ts_std(self.close, 60)
        return self._safe_last(safe_div(std_short, std_long))

    def bollinger_width(self) -> Optional[float]:
        """布林带宽度：(BB_upper - BB_lower) / BB_mid"""
        bb_mid = self._indicator_values.get("BB_mid")
        bb_upper = self._indicator_values.get("BB_upper")
        bb_lower = self._indicator_values.get("BB_lower")
        if bb_mid and bb_upper and bb_lower and bb_mid != 0:
            return float((bb_upper - bb_lower) / bb_mid)
        return None

    def atr_percentile(self) -> Optional[float]:
        """真实波幅百分位：ts_rank(ATR / close, 60)"""
        atr = self._series("ATR", period=14)
        ratio = safe_div(atr, self.close)
        return self._safe_last(ts_rank(ratio, 60))

    def pattern_score(self) -> Optional[float]:
        """K线形态得分（直接从指标取）。"""
        return float(self._indicator_values.get("pattern_score", 0))

    def gap_factor(self) -> Optional[float]:
        """缺口因子：(open - prev_close) / ATR"""
        prev_close = self.close.shift(1)
        atr = self._series("ATR", period=14)
        gap = self.open_ - prev_close
        return self._safe_last(safe_div(gap, atr))

    def ema_cross_strength(self) -> Optional[float]:
        """EMA 交叉强度：(EMA12 - EMA26) / ts_std(EMA12 - EMA26, 20)"""
        ema12 = self._series("EMA", period=12)
        ema26 = self._series("EMA", period=26)
        diff = ema12 - ema26
        std = ts_std(diff, 20)
        return self._safe_last(safe_div(diff, std))

    def kdj_j_deviation(self) -> Optional[float]:
        """KDJ 超买超卖：(J - ts_mean(J, 20)) / ts_std(J, 20)"""
        j = self._series("KDJ_J")
        j_mean = ts_mean(j, 20)
        j_std = ts_std(j, 20)
        return self._safe_last(safe_div(j - j_mean, j_std))

    def fund_flow_strength(self) -> Optional[float]:
        """资金流向强度：ts_corr(close - open, volume, 10)"""
        body = self.close - self.open_
        return self._safe_last(ts_corr(body, self.volume, 10))

    def compute_all(self) -> Dict[str, Optional[float]]:
        """计算全部 15 个因子，返回合并字典（含指标快照）。"""
        factors = {
            "momentum_short": self.momentum_short(),
            "momentum_mid_rank": self.momentum_mid_rank(),
            "rsi_deviation": self.rsi_deviation(),
            "macd_hist_momentum": self.macd_hist_momentum(),
            "volume_price_corr": self.volume_price_corr(),
            "volume_ratio": self.volume_ratio(),
            "obv_trend": self.obv_trend(),
            "volatility_compression": self.volatility_compression(),
            "bollinger_width": self.bollinger_width(),
            "atr_percentile": self.atr_percentile(),
            "pattern_score": self.pattern_score(),
            "gap_factor": self.gap_factor(),
            "ema_cross_strength": self.ema_cross_strength(),
            "kdj_j_deviation": self.kdj_j_deviation(),
            "fund_flow_strength": self.fund_flow_strength(),
        }
        # 合并原始指标快照
        result = dict(self._indicator_values)
        result.update(factors)
        return result
