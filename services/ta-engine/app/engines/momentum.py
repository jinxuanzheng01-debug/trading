"""动量反转信号引擎。"""

from __future__ import annotations

from typing import Dict, List, Optional

from ..core.signals import Signal
from .base import BaseEngine, StrategyResult, classify_score


class MomentumReversalEngine(BaseEngine):
    """动量反转：不依赖趋势，抓超买超卖拐点。"""

    name = "momentum"

    def evaluate(
        self,
        factors: Dict[str, Optional[float]],
        signals: List[Signal],
    ) -> StrategyResult:
        active = self._filter_signals(
            signals, ["超卖反转", "超买回调", "MACD动能转正", "MACD动能衰竭", "缩量地量"]
        )
        weights = {
            "超卖反转": 0.25,
            "超买回调": 0.25,
            "MACD动能转正": 0.15,
            "MACD动能衰竭": 0.15,
            "缩量地量": 0.20,
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
            factors_snapshot={k: factors.get(k) for k in ["rsi_deviation", "macd_hist_momentum", "volume_ratio"]},
        )
