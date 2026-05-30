from app.core.signals import SignalDetector, Signal
from app.core.factors import FactorCalculator


class TestSignalDetector:
    def test_detect_returns_list_of_signals(self, sample_ohlcv):
        factors = FactorCalculator(sample_ohlcv).compute_all()
        detector = SignalDetector(factors)
        signals = detector.detect_all()
        assert isinstance(signals, list)
        assert all(isinstance(s, Signal) for s in signals)

    def test_signal_has_required_fields(self, sample_ohlcv):
        factors = FactorCalculator(sample_ohlcv).compute_all()
        detector = SignalDetector(factors)
        signals = detector.detect_all()
        for s in signals:
            assert hasattr(s, "name")
            assert hasattr(s, "triggered")
            assert hasattr(s, "direction")
            assert hasattr(s, "strength")
            assert hasattr(s, "factor_value")
            assert s.direction in ("long", "short", "neutral")

    def test_untriggered_signals_have_zero_strength(self, sample_ohlcv):
        factors = FactorCalculator(sample_ohlcv).compute_all()
        detector = SignalDetector(factors)
        signals = detector.detect_all()
        for s in signals:
            if not s.triggered:
                assert s.strength == 0

    def test_16_signals_detected(self, sample_ohlcv):
        factors = FactorCalculator(sample_ohlcv).compute_all()
        detector = SignalDetector(factors)
        signals = detector.detect_all()
        assert len(signals) == 16
