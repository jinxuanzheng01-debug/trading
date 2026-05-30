"""信号检测：因子 + 阈值条件 → 触发/未触发。"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional


@dataclass
class Signal:
    """单个信号的检测结果。"""

    name: str
    triggered: bool
    direction: str  # "long" | "short" | "neutral"
    strength: float = 0.0  # 0-100
    factor_value: Optional[float] = None


class SignalDetector:
    """基于因子值的信号检测器。"""

    def __init__(self, factors: Dict[str, Optional[float]]):
        self.factors = factors

    def _val(self, name: str) -> Optional[float]:
        return self.factors.get(name)

    def _strength(self, val: float, max_val: float = 3.0) -> float:
        """将因子值映射到 0-100 的强度。"""
        return min(abs(val) / max_val * 100, 100)

    def detect_all(self) -> List[Signal]:
        return [
            # 趋势/动量信号
            self.momentum_start(),
            self.momentum_decay(),
            # 反转信号
            self.oversold_bounce(),
            self.overbought_pullback(),
            self.macd_bullish(),
            self.macd_bearish(),
            # 量价信号
            self.volume_resonance(),
            self.volume_divergence(),
            self.volume_breakout(),
            self.volume_dry(),
            # 波动率信号
            self.volatility_squeeze(),
            self.volatility_expansion(),
            # 形态信号
            self.pattern_bullish(),
            self.pattern_bearish(),
            # 缺口信号
            self.gap_up(),
            self.gap_down(),
        ]

    # --- 16 个信号实现 ---

    def momentum_start(self) -> Signal:
        """动量启动：短期动量因子从负转正。"""
        val = self._val("momentum_short")
        triggered = val is not None and val > 0
        return Signal("动量启动", triggered, "long",
                      self._strength(val) if triggered else 0, val)

    def momentum_decay(self) -> Signal:
        """动量衰减：> 1.5 后回落至 0.5 以下。"""
        val = self._val("momentum_short")
        triggered = val is not None and 0 < val < 0.5
        return Signal("动量衰减", triggered, "short",
                      self._strength(1.5 - val) if triggered else 0, val)

    def oversold_bounce(self) -> Signal:
        """超卖反转：RSI 偏离加速度 < -1.5。"""
        val = self._val("rsi_deviation")
        triggered = val is not None and val < -1.5
        return Signal("超卖反转", triggered, "long",
                      self._strength(val) if triggered else 0, val)

    def overbought_pullback(self) -> Signal:
        """超买回调：RSI 偏离加速度 > 1.5。"""
        val = self._val("rsi_deviation")
        triggered = val is not None and val > 1.5
        return Signal("超买回调", triggered, "short",
                      self._strength(val) if triggered else 0, val)

    def macd_bullish(self) -> Signal:
        """MACD 动能转正。"""
        val = self._val("macd_hist_momentum")
        triggered = val is not None and val > 0
        return Signal("MACD动能转正", triggered, "long",
                      self._strength(val) if triggered else 0, val)

    def macd_bearish(self) -> Signal:
        """MACD 动能衰竭。"""
        val = self._val("macd_hist_momentum")
        triggered = val is not None and 0 < val < 0.5
        return Signal("MACD动能衰竭", triggered, "short",
                      self._strength(1.5 - val) if triggered else 0, val)

    def volume_resonance(self) -> Signal:
        """量价共振：量价相关因子 > 0.5。"""
        val = self._val("volume_price_corr")
        triggered = val is not None and val > 0.5
        return Signal("量价共振", triggered, "long",
                      self._strength(val) if triggered else 0, val)

    def volume_divergence(self) -> Signal:
        """量价背离：量价相关因子 < -0.5。"""
        val = self._val("volume_price_corr")
        triggered = val is not None and val < -0.5
        return Signal("量价背离", triggered, "short",
                      self._strength(val) if triggered else 0, val)

    def volume_breakout(self) -> Signal:
        """放量突破：量能偏离 > 2.0。"""
        val = self._val("volume_ratio")
        triggered = val is not None and val > 2.0
        return Signal("放量突破", triggered, "long",
                      self._strength(val - 1) if triggered else 0, val)

    def volume_dry(self) -> Signal:
        """缩量地量：量能偏离 < 0.5。"""
        val = self._val("volume_ratio")
        triggered = val is not None and val < 0.5
        return Signal("缩量地量", triggered, "neutral",
                      self._strength(1 - val) if triggered else 0, val)

    def volatility_squeeze(self) -> Signal:
        """波动收敛：波动率压缩 < 0.5。"""
        val = self._val("volatility_compression")
        triggered = val is not None and val < 0.5
        return Signal("波动收敛", triggered, "neutral",
                      self._strength(1 - val) if triggered else 0, val)

    def volatility_expansion(self) -> Signal:
        """波动扩张：波动率压缩 > 2.0。"""
        val = self._val("volatility_compression")
        triggered = val is not None and val > 2.0
        return Signal("波动扩张", triggered, "neutral",
                      self._strength(val) if triggered else 0, val)

    def pattern_bullish(self) -> Signal:
        """形态看涨共振：pattern_score > 2。"""
        val = self._val("pattern_score")
        triggered = val is not None and val > 2
        return Signal("形态看涨共振", triggered, "long",
                      self._strength(val) if triggered else 0, val)

    def pattern_bearish(self) -> Signal:
        """形态看跌共振：pattern_score < -2。"""
        val = self._val("pattern_score")
        triggered = val is not None and val < -2
        return Signal("形态看跌共振", triggered, "short",
                      self._strength(val) if triggered else 0, val)

    def gap_up(self) -> Signal:
        """跳空高开：缺口因子 > 1.0。"""
        val = self._val("gap_factor")
        triggered = val is not None and val > 1.0
        return Signal("跳空高开", triggered, "long",
                      self._strength(val) if triggered else 0, val)

    def gap_down(self) -> Signal:
        """跳空低开：缺口因子 < -1.0。"""
        val = self._val("gap_factor")
        triggered = val is not None and val < -1.0
        return Signal("跳空低开", triggered, "short",
                      self._strength(val) if triggered else 0, val)
