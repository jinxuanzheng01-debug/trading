from app.services.analyzer import Analyzer


class TestAnalyzer:
    def test_analyze_with_dataframe(self, sample_ohlcv):
        analyzer = Analyzer()
        result = analyzer.analyze_dataframe("TEST", sample_ohlcv)
        assert result["symbol"] == "TEST"
        assert "overall_score" in result
        assert "signal" in result
        assert result["signal"] in ("BUY", "HOLD", "SELL")
        assert "confidence" in result
        assert "dimensions" in result
        assert "trend" in result["dimensions"]
        assert "momentum" in result["dimensions"]
        assert "volume" in result["dimensions"]
        assert "pattern" in result["dimensions"]
        assert "active_signals" in result
        assert "factors" in result
        assert "indicators" in result
