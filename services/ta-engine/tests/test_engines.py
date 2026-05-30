from app.core.factors import FactorCalculator
from app.core.signals import SignalDetector
from app.engines.trend import TrendFollowingEngine
from app.engines.momentum import MomentumReversalEngine
from app.engines.volume import VolumePriceEngine
from app.engines.pattern import PatternEngine
from app.engines.base import StrategyResult


class TestTrendFollowingEngine:
    def test_returns_strategy_result(self, sample_ohlcv):
        factors = FactorCalculator(sample_ohlcv).compute_all()
        signals = SignalDetector(factors).detect_all()
        engine = TrendFollowingEngine()
        result = engine.evaluate(factors, signals)
        assert isinstance(result, StrategyResult)
        assert -100 <= result.score <= 100
        assert result.signal in ("BUY", "HOLD", "SELL")
        assert 0 <= result.confidence <= 100


class TestMomentumReversalEngine:
    def test_returns_strategy_result(self, sample_ohlcv):
        factors = FactorCalculator(sample_ohlcv).compute_all()
        signals = SignalDetector(factors).detect_all()
        engine = MomentumReversalEngine()
        result = engine.evaluate(factors, signals)
        assert isinstance(result, StrategyResult)
        assert -100 <= result.score <= 100


class TestVolumePriceEngine:
    def test_returns_strategy_result(self, sample_ohlcv):
        factors = FactorCalculator(sample_ohlcv).compute_all()
        signals = SignalDetector(factors).detect_all()
        engine = VolumePriceEngine()
        result = engine.evaluate(factors, signals)
        assert isinstance(result, StrategyResult)


class TestPatternEngine:
    def test_returns_strategy_result(self, sample_ohlcv):
        factors = FactorCalculator(sample_ohlcv).compute_all()
        signals = SignalDetector(factors).detect_all()
        engine = PatternEngine()
        result = engine.evaluate(factors, signals)
        assert isinstance(result, StrategyResult)
