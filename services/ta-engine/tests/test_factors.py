import pandas as pd
import numpy as np
from app.core.factors import FactorCalculator


class TestFactorCalculator:
    def test_momentum_short(self, sample_ohlcv):
        calc = FactorCalculator(sample_ohlcv)
        result = calc.compute_all()
        assert "momentum_short" in result
        assert isinstance(result["momentum_short"], float)

    def test_rsi_deviation(self, sample_ohlcv):
        calc = FactorCalculator(sample_ohlcv)
        result = calc.compute_all()
        assert "rsi_deviation" in result

    def test_volume_price_corr(self, sample_ohlcv):
        calc = FactorCalculator(sample_ohlcv)
        result = calc.compute_all()
        assert "volume_price_corr" in result
        # 相关系数应在 [-1, 1]
        val = result["volume_price_corr"]
        if val is not None:
            assert -1.1 <= val <= 1.1

    def test_volume_ratio(self, sample_ohlcv):
        calc = FactorCalculator(sample_ohlcv)
        result = calc.compute_all()
        assert "volume_ratio" in result
        assert result["volume_ratio"] > 0

    def test_volatility_compression(self, sample_ohlcv):
        calc = FactorCalculator(sample_ohlcv)
        result = calc.compute_all()
        assert "volatility_compression" in result

    def test_pattern_score(self, sample_ohlcv):
        calc = FactorCalculator(sample_ohlcv)
        result = calc.compute_all()
        assert "pattern_score" in result

    def test_gap_factor(self, sample_ohlcv):
        calc = FactorCalculator(sample_ohlcv)
        result = calc.compute_all()
        assert "gap_factor" in result

    def test_ema_cross_strength(self, sample_ohlcv):
        calc = FactorCalculator(sample_ohlcv)
        result = calc.compute_all()
        assert "ema_cross_strength" in result

    def test_all_15_factors_present(self, sample_ohlcv):
        calc = FactorCalculator(sample_ohlcv)
        result = calc.compute_all()
        expected_factors = [
            "momentum_short", "momentum_mid_rank",
            "rsi_deviation", "macd_hist_momentum",
            "volume_price_corr", "volume_ratio", "obv_trend",
            "volatility_compression", "bollinger_width", "atr_percentile",
            "pattern_score", "gap_factor",
            "ema_cross_strength", "kdj_j_deviation", "fund_flow_strength",
        ]
        for f in expected_factors:
            assert f in result, f"Missing factor: {f}"

    def test_compute_all_returns_indicators(self, sample_ohlcv):
        calc = FactorCalculator(sample_ohlcv)
        result = calc.compute_all()
        # 应同时包含原始指标
        assert "RSI14" in result
        assert "MACD" in result
