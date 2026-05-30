"""分析编排器：串联指标→因子→信号→策略→综合评分。"""

from __future__ import annotations

from pathlib import Path
from typing import Dict, Optional

import yaml
import pandas as pd

from ..core.indicators import IndicatorsCalculator
from ..core.factors import FactorCalculator
from ..core.signals import SignalDetector
from ..core.factor_meta import get_all_factor_meta
from ..engines.trend import TrendFollowingEngine
from ..engines.momentum import MomentumReversalEngine
from ..engines.volume import VolumePriceEngine
from ..engines.pattern import PatternEngine
from ..engines.base import classify_score


class Analyzer:
    """技术面分析编排器。"""

    def __init__(self):
        self.engines = {
            "trend": TrendFollowingEngine(),
            "momentum": MomentumReversalEngine(),
            "volume": VolumePriceEngine(),
            "pattern": PatternEngine(),
        }
        self.weights = self._load_weights()

    def _load_weights(self) -> Dict[str, float]:
        """从 weights.yaml 加载维度权重。"""
        weights_path = Path(__file__).parent.parent / "strategies" / "weights.yaml"
        if weights_path.exists():
            with open(weights_path) as f:
                return yaml.safe_load(f)
        return {"trend": 0.35, "momentum": 0.30, "volume": 0.20, "pattern": 0.15}

    def analyze_dataframe(
        self, symbol: str, df: pd.DataFrame
    ) -> Dict:
        """对 DataFrame 执行完整技术面分析。"""
        # 1. 计算指标
        indicators = IndicatorsCalculator(df).compute_all()

        # 2. 计算因子
        factors = FactorCalculator(df).compute_all()

        # 3. 检测信号
        signals = SignalDetector(factors).detect_all()

        # 4. 各策略引擎评分
        dimensions = {}
        for name, engine in self.engines.items():
            result = engine.evaluate(factors, signals)
            dimensions[name] = {
                "score": result.score,
                "signal": result.signal,
                "confidence": result.confidence,
                "active_signals": [
                    {
                        "name": s.name,
                        "direction": s.direction,
                        "strength": s.strength,
                        "factor_value": s.factor_value,
                    }
                    for s in result.active_signals
                ],
            }

        # 5. 综合加权评分
        overall_score = sum(
            self.weights.get(name, 0.25) * dim["score"]
            for name, dim in dimensions.items()
        )
        overall_score = max(-100, min(100, overall_score))

        # 6. 综合置信度
        confidence = sum(
            self.weights.get(name, 0.25) * dim["confidence"]
            for name, dim in dimensions.items()
        )

        # 7. 汇总活跃信号
        all_active = []
        seen = set()
        for dim in dimensions.values():
            for s in dim["active_signals"]:
                if s["name"] not in seen:
                    all_active.append(s)
                    seen.add(s["name"])

        return {
            "symbol": symbol,
            "overall_score": round(overall_score, 2),
            "signal": classify_score(overall_score),
            "confidence": round(confidence, 1),
            "dimensions": dimensions,
            "active_signals": all_active,
            "factors": {k: round(v, 4) if isinstance(v, float) else v for k, v in factors.items()},
            "factor_meta": get_all_factor_meta(),
            "indicators": {k: round(v, 4) if isinstance(v, float) else v for k, v in indicators.items()},
        }
