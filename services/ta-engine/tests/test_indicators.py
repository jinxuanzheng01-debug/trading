import pandas as pd
import numpy as np
from app.core.indicators import IndicatorsCalculator


class TestIndicatorsCalculator:
    def test_ma(self, sample_ohlcv):
        calc = IndicatorsCalculator(sample_ohlcv)
        result = calc.compute_ma([5, 20])
        assert "MA5" in result
        assert "MA20" in result
        assert not np.isnan(result["MA5"])

    def test_ema(self, sample_ohlcv):
        calc = IndicatorsCalculator(sample_ohlcv)
        result = calc.compute_ema([12, 26])
        assert "EMA12" in result
        assert "EMA26" in result

    def test_rsi(self, sample_ohlcv):
        calc = IndicatorsCalculator(sample_ohlcv)
        result = calc.compute_rsi([14])
        assert "RSI14" in result
        assert 0 <= result["RSI14"] <= 100

    def test_macd(self, sample_ohlcv):
        calc = IndicatorsCalculator(sample_ohlcv)
        result = calc.compute_macd()
        assert "MACD" in result
        assert "Signal" in result
        assert "Histogram" in result

    def test_atr(self, sample_ohlcv):
        calc = IndicatorsCalculator(sample_ohlcv)
        result = calc.compute_atr(14)
        assert "ATR14" in result
        assert result["ATR14"] > 0

    def test_bollinger(self, sample_ohlcv):
        calc = IndicatorsCalculator(sample_ohlcv)
        result = calc.compute_bollinger()
        assert "BB_upper" in result
        assert "BB_mid" in result
        assert "BB_lower" in result
        assert result["BB_upper"] > result["BB_lower"]

    def test_obv(self, sample_ohlcv):
        calc = IndicatorsCalculator(sample_ohlcv)
        result = calc.compute_obv()
        assert "OBV" in result
        assert isinstance(result["OBV"], (int, float, np.floating))

    def test_adx(self, sample_ohlcv):
        calc = IndicatorsCalculator(sample_ohlcv)
        result = calc.compute_adx(14)
        assert "ADX14" in result
        assert "PLUS_DI14" in result
        assert "MINUS_DI14" in result

    def test_kdj(self, sample_ohlcv):
        calc = IndicatorsCalculator(sample_ohlcv)
        result = calc.compute_kdj()
        assert "K" in result
        assert "D" in result
        assert "J" in result

    def test_candlestick_patterns(self, sample_ohlcv):
        calc = IndicatorsCalculator(sample_ohlcv)
        result = calc.compute_candlestick_patterns()
        assert isinstance(result, dict)
        assert "pattern_score" in result
        assert isinstance(result["pattern_score"], (int, float, np.integer, np.floating))
        assert "bullish_count" in result
        assert "bearish_count" in result

    def test_compute_all(self, sample_ohlcv):
        calc = IndicatorsCalculator(sample_ohlcv)
        result = calc.compute_all()
        assert isinstance(result, dict)
        assert "MA5" in result
        assert "RSI14" in result
        assert "MACD" in result
        assert "ATR14" in result
        assert "OBV" in result
        assert "pattern_score" in result
