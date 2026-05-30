"""策略引擎基类。"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional

from ..core.signals import Signal


def classify_score(score: float) -> str:
    """将分数映射为 BUY/HOLD/SELL。"""
    if score > 20:
        return "BUY"
    elif score < -20:
        return "SELL"
    return "HOLD"


@dataclass
class StrategyResult:
    """单个策略的评估结果。"""

    name: str
    score: float  # -100 ~ +100
    signal: str   # "BUY" | "HOLD" | "SELL"
    confidence: float  # 0 ~ 100
    active_signals: List[Signal] = field(default_factory=list)
    factors_snapshot: Dict[str, Optional[float]] = field(default_factory=dict)


class BaseEngine:
    """策略引擎基类。子类实现 evaluate()。"""

    name: str = "base"

    def evaluate(
        self,
        factors: Dict[str, Optional[float]],
        signals: List[Signal],
    ) -> StrategyResult:
        raise NotImplementedError

    def _filter_signals(self, signals: List[Signal], names: List[str]) -> List[Signal]:
        """过滤出指定名称的已触发信号。"""
        return [s for s in signals if s.triggered and s.name in names]

    def _weighted_score(
        self, active: List[tuple], max_total: float = 100.0
    ) -> float:
        """加权评分。active = [(signal, weight), ...]"""
        total = sum(w * s.strength for s, w in active)
        return max(-max_total, min(max_total, total))
