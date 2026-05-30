"""趋势跟踪信号引擎。"""

from __future__ import annotations

from typing import Dict, List, Optional

from ..core.signals import Signal
from .base import BaseEngine, StrategyResult, classify_score


class TrendFollowingEngine(BaseEngine):
    """趋势跟踪：需要趋势存在（ADX > 25 + EMA 交叉强度），否则低 confidence HOLD。"""

    name = "trend"

    def evaluate(
        self,
        factors: Dict[str, Optional[float]],
        signals: List[Signal],
    ) -> StrategyResult:
        # 判断趋势是否存在
        adx = factors.get("ADX14")
        ema_cross = factors.get("ema_cross_strength")
        has_trend = (
            adx is not None and adx > 25
            and ema_cross is not None and abs(ema_cross) > 0.3
        )

        # 相关信号
        active = self._filter_signals(signals, ["动量启动", "量价共振", "波动收敛"])
        weights = {"动量启动": 0.4, "量价共振": 0.3, "波动收敛": 0.3}

        if not has_trend:
            return StrategyResult(
                name=self.name,
                score=0,
                signal="HOLD",
                confidence=20,
                active_signals=[],
                factors_snapshot={k: factors.get(k) for k in ["ADX14", "ema_cross_strength"]},
            )

        # 加权评分
        weighted = [(s, weights.get(s.name, 0)) for s in active]
        score = self._weighted_score(weighted)

        # 趋势方向：EMA 交叉强度正=看多，负=看空
        if ema_cross is not None and ema_cross < 0:
            score = -abs(score)

        confidence = min(30 + len(active) * 25, 100)

        return StrategyResult(
            name=self.name,
            score=score,
            signal=classify_score(score),
            confidence=confidence,
            active_signals=active,
            factors_snapshot={k: factors.get(k) for k in ["ADX14", "ema_cross_strength", "momentum_short"]},
        )
