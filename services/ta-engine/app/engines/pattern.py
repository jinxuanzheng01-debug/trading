"""K线形态识别信号引擎。"""

from __future__ import annotations

from typing import Dict, List, Optional

from ..core.signals import Signal
from .base import BaseEngine, StrategyResult, classify_score


class PatternEngine(BaseEngine):
    """K线形态：基于 pattern_score 因子的简单投票。"""

    name = "pattern"

    def evaluate(
        self,
        factors: Dict[str, Optional[float]],
        signals: List[Signal],
    ) -> StrategyResult:
        active = self._filter_signals(signals, ["形态看涨共振", "形态看跌共振", "跳空高开", "跳空低开"])

        score = 0.0
        for s in active:
            if s.direction == "long":
                score += s.strength * 0.6
            elif s.direction == "short":
                score -= s.strength * 0.6

        score = max(-100, min(100, score))
        confidence = min(20 + len(active) * 30, 100)

        return StrategyResult(
            name=self.name,
            score=score,
            signal=classify_score(score),
            confidence=confidence,
            active_signals=active,
            factors_snapshot={k: factors.get(k) for k in ["pattern_score", "gap_factor"]},
        )
