from abc import ABC, abstractmethod
import pandas as pd
import numpy as np


class IndicatorStrategy(ABC):
    """基于 DataFrame 的信号策略"""

    @abstractmethod
    def generate_signals(self, df: pd.DataFrame) -> pd.Series:
        """
        输入：OHLCV DataFrame
        输出：信号 Series（1=买入, -1=卖出, 0=持有）
        """
        pass


# ---- 内置策略模板 ----

class MACrossStrategy(IndicatorStrategy):
    """双均线交叉策略"""
    def __init__(self, fast: int = 5, slow: int = 20):
        self.fast = fast
        self.slow = slow

    def generate_signals(self, df: pd.DataFrame) -> pd.Series:
        fast_ma = df["close"].rolling(self.fast).mean()
        slow_ma = df["close"].rolling(self.slow).mean()
        signals = pd.Series(0, index=df.index)
        signals[fast_ma > slow_ma] = 1
        signals[fast_ma < slow_ma] = -1
        return signals


class MACDStrategy(IndicatorStrategy):
    def __init__(self, fast: int = 12, slow: int = 26, signal: int = 9):
        self.fast = fast
        self.slow = slow
        self.signal = signal

    def generate_signals(self, df: pd.DataFrame) -> pd.Series:
        ema_fast = df["close"].ewm(span=self.fast).mean()
        ema_slow = df["close"].ewm(span=self.slow).mean()
        macd = ema_fast - ema_slow
        signal_line = macd.ewm(span=self.signal).mean()
        signals = pd.Series(0, index=df.index)
        signals[macd > signal_line] = 1
        signals[macd < signal_line] = -1
        return signals


class RSIStrategy(IndicatorStrategy):
    def __init__(self, period: int = 14, oversold: int = 30, overbought: int = 70):
        self.period = period
        self.oversold = oversold
        self.overbought = overbought

    def generate_signals(self, df: pd.DataFrame) -> pd.Series:
        delta = df["close"].diff()
        gain = delta.where(delta > 0, 0.0)
        loss = (-delta).where(delta < 0, 0.0)
        avg_gain = gain.rolling(self.period).mean()
        avg_loss = loss.rolling(self.period).mean()
        rs = avg_gain / avg_loss
        rsi = 100 - (100 / (1 + rs))
        signals = pd.Series(0, index=df.index)
        signals[rsi < self.oversold] = 1
        signals[rsi > self.overbought] = -1
        return signals


class BollingerStrategy(IndicatorStrategy):
    def __init__(self, period: int = 20, std: float = 2.0):
        self.period = period
        self.std = std

    def generate_signals(self, df: pd.DataFrame) -> pd.Series:
        sma = df["close"].rolling(self.period).mean()
        std = df["close"].rolling(self.period).std()
        upper = sma + self.std * std
        lower = sma - self.std * std
        signals = pd.Series(0, index=df.index)
        signals[df["close"] < lower] = 1
        signals[df["close"] > upper] = -1
        return signals


# 策略注册表
STRATEGIES = {
    "ma_cross": MACrossStrategy,
    "macd": MACDStrategy,
    "rsi": RSIStrategy,
    "bollinger": BollingerStrategy,
}


def get_strategy_template(name: str):
    """获取策略模板类"""
    return STRATEGIES.get(name)
