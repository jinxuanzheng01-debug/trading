import pytest
import pandas as pd
import numpy as np
from app.core.operators import (
    ts_mean, ts_std, ts_min, ts_max, ts_rank,
    ts_corr, delta, decay_linear, safe_div,
)


class TestTsMean:
    def test_basic(self, sample_ohlcv):
        result = ts_mean(sample_ohlcv["close"], 5)
        assert isinstance(result, pd.Series)
        assert result.iloc[:4].isna().all()
        expected = sample_ohlcv["close"].iloc[:5].mean()
        assert abs(result.iloc[4] - expected) < 1e-10

    def test_invalid_window(self):
        with pytest.raises(ValueError):
            ts_mean(pd.Series([1.0, 2.0]), 0)


class TestTsStd:
    def test_basic(self, sample_ohlcv):
        result = ts_std(sample_ohlcv["close"], 10)
        assert isinstance(result, pd.Series)
        assert result.iloc[:9].isna().all()

    def test_invalid_window(self):
        with pytest.raises(ValueError):
            ts_std(pd.Series([1.0, 2.0]), 1)


class TestDelta:
    def test_basic(self):
        s = pd.Series([10.0, 11.0, 12.0, 10.0])
        result = delta(s, 1)
        assert result.iloc[1] == 1.0
        assert result.iloc[2] == 1.0
        assert result.iloc[3] == -2.0

    def test_lookahead_ban(self):
        with pytest.raises(ValueError):
            delta(pd.Series([1.0]), -1)


class TestSafeDiv:
    def test_normal(self):
        a = pd.Series([10.0, 20.0])
        b = pd.Series([2.0, 4.0])
        result = safe_div(a, b)
        assert result.iloc[0] == 5.0
        assert result.iloc[1] == 5.0

    def test_zero_denominator(self):
        a = pd.Series([10.0])
        b = pd.Series([0.0])
        result = safe_div(a, b)
        assert not np.isinf(result.iloc[0])


class TestTsCorr:
    def test_basic(self, sample_ohlcv):
        result = ts_corr(
            sample_ohlcv["close"].pct_change(),
            sample_ohlcv["volume"].pct_change(),
            10,
        )
        assert isinstance(result, pd.Series)
        valid = result.dropna()
        assert (valid >= -1.1).all() and (valid <= 1.1).all()


class TestTsRank:
    def test_basic(self, sample_ohlcv):
        result = ts_rank(sample_ohlcv["close"], 20)
        assert isinstance(result, pd.Series)
        valid = result.dropna()
        assert (valid >= 0).all() and (valid <= 1).all()


class TestDecayLinear:
    def test_basic(self, sample_ohlcv):
        result = decay_linear(sample_ohlcv["close"], 5)
        assert isinstance(result, pd.Series)
        assert result.iloc[:4].isna().all()
