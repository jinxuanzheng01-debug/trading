from abc import ABC, abstractmethod
import pandas as pd


class IndicatorStrategy(ABC):
    """基于 DataFrame 的信号策略"""

    @abstractmethod
    def generate_signals(self, df: pd.DataFrame) -> pd.Series:
        """
        输入：OHLCV DataFrame
        输出：信号 Series（1=买入, -1=卖出, 0=持有）
        """
        pass
