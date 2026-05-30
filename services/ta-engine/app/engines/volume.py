"""量价分析信号引擎。"""

from __future__ import annotations

from typing import Dict, List, Optional

from ..core.signals import Signal
from .base import BaseEngine, StrategyResult, classify_score


class VolumePriceEngine(BaseEngine):
    """量价分析：量价背离优先级最高。"""

    name = "volume"

    def evaluate(
        self,
        factors: Dict[str, Optional[float]],
        signals: List[Signal],
    ) -> StrategyResult:
        active = self._filter_signals(
            signals, ["量价背离", "量价共振", "放量突破", "缩量地量"]
        )
        weights = {
            "量价背离": 0.40,
            "量价共振": 0.35,
            "放量突破": 0.15,
            "缩量地量": 0.10,
        }

        weighted = [(s, weights.get(s.name, 0)) for s in active]
        score = self._weighted_score(weighted)

        confidence = min(25 + len(active) * 25, 100)

        return StrategyResult(
            name=self.name,
            score=score,
            signal=classify_score(score),
            confidence=confidence,
            active_signals=active,
            factors_snapshot={k: factors.get(k) for k in ["volume_price_corr", "volume_ratio", "obv_trend"]},
        )
