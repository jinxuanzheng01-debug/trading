"""标准算子库，借鉴 Vibe-Trading Alpha Zoo。

所有算子作用于 pandas Series（单只股票的时间序列）。
NaN 策略：传播 NaN，不静默 fillna(0)。
前视偏差禁止：delta 的 lag 必须 >= 1。
"""

from __future__ import annotations

import numpy as np
import pandas as pd


def ts_mean(s: pd.Series, n: int) -> pd.Series:
    """滚动均值，前 n-1 个值为 NaN（warmup）。"""
    if n < 1:
        raise ValueError(f"ts_mean window must be >= 1, got {n}")
    return s.rolling(window=n, min_periods=n).mean()


def ts_std(s: pd.Series, n: int) -> pd.Series:
    """滚动标准差（ddof=1），前 n-1 个值为 NaN。"""
    if n < 2:
        raise ValueError(f"ts_std window must be >= 2, got {n}")
    return s.rolling(window=n, min_periods=n).std(ddof=1)


def ts_max(s: pd.Series, n: int) -> pd.Series:
    """滚动最大值。"""
    if n < 1:
        raise ValueError(f"ts_max window must be >= 1, got {n}")
    return s.rolling(window=n, min_periods=n).max()


def ts_min(s: pd.Series, n: int) -> pd.Series:
    """滚动最小值。"""
    if n < 1:
        raise ValueError(f"ts_min window must be >= 1, got {n}")
    return s.rolling(window=n, min_periods=n).min()


def ts_rank(s: pd.Series, n: int) -> pd.Series:
    """滚动百分位排名：当前值在过去 n 期中的百分位 [0, 1]。"""
    if n < 1:
        raise ValueError(f"ts_rank window must be >= 1, got {n}")

    def _rank_last(arr: np.ndarray) -> float:
        if np.isnan(arr).all():
            return np.nan
        last = arr[-1]
        if np.isnan(last):
            return np.nan
        valid = arr[~np.isnan(arr)]
        if valid.size == 0:
            return np.nan
        less = (valid < last).sum()
        eq = (valid == last).sum()
        return float((less + 0.5 * (eq + 1)) / valid.size)

    return s.rolling(window=n, min_periods=n).apply(_rank_last, raw=True)


def ts_corr(x: pd.Series, y: pd.Series, n: int) -> pd.Series:
    """滚动 Pearson 相关系数。"""
    if n < 2:
        raise ValueError(f"ts_corr window must be >= 2, got {n}")
    corr = x.rolling(window=n, min_periods=n).corr(y)
    return corr.replace([np.inf, -np.inf], np.nan)


def delta(s: pd.Series, d: int) -> pd.Series:
    """d 期差分。d >= 1（禁止前视偏差）。"""
    if d < 1:
        raise ValueError(f"delta lag must be >= 1 (lookahead ban), got {d}")
    return s - s.shift(d)


def decay_linear(s: pd.Series, n: int) -> pd.Series:
    """线性衰减加权移动平均，权重 n, n-1, ..., 1 归一化。"""
    if n < 1:
        raise ValueError(f"decay_linear window must be >= 1, got {n}")
    weights = np.arange(n, 0, -1, dtype=np.float64)
    weights /= weights.sum()

    def _apply(arr: np.ndarray) -> float:
        if np.isnan(arr).any():
            return np.nan
        return float(np.dot(arr, weights))

    return s.rolling(window=n, min_periods=n).apply(_apply, raw=True)


def safe_div(a: pd.Series | float, b: pd.Series | float, eps: float = 1e-12) -> pd.Series:
    """安全除法，b == 0 时返回 NaN。"""
    a = pd.Series(a) if not isinstance(a, pd.Series) else a.astype(float)
    b = pd.Series(b) if not isinstance(b, pd.Series) else b.astype(float)
    sign = np.sign(b.values)
    denom = b.values + eps * sign
    result = a.values / denom
    result = np.where(np.isfinite(result), result, np.nan)
    return pd.Series(result, index=a.index)
