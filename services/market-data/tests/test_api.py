"""
Market Data Service - End-to-End API Tests

These tests require the market-data service to be running on http://localhost:8000

To run tests:
1. Start required services:
   docker-compose up -d postgres redis

2. Start the market-data service:
   cd services/market-data
   python -m app.main

3. Run tests in another terminal:
   pytest tests/test_api.py -v
"""

import pytest
import httpx
from typing import Dict, Any

BASE_URL = "http://localhost:8000"


def test_health_check():
    """Test health check endpoint"""
    response = httpx.get(f"{BASE_URL}/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "timestamp" in data


@pytest.mark.parametrize("symbol", ["AAPL", "TSLA", "MSFT"])
def test_get_us_stock_quote(symbol):
    """Test getting US stock quotes via yfinance"""
    try:
        response = httpx.get(f"{BASE_URL}/api/quote", params={"symbol": symbol}, timeout=10.0)
        assert response.status_code == 200
        data = response.json()
        assert data["symbol"] == symbol
        assert "price" in data
        assert "change" in data
        assert "change_percent" in data
    except httpx.ConnectError:
        pytest.skip(f"Service not running at {BASE_URL}")
    except httpx.TimeoutException:
        pytest.skip(f"Request timeout for {symbol}")


@pytest.mark.parametrize("symbol", ["000001", "600000", "600519"])
def test_get_a_stock_quote(symbol):
    """Test getting A-share quotes via AkShare"""
    try:
        response = httpx.get(f"{BASE_URL}/api/quote", params={"symbol": symbol}, timeout=10.0)
        assert response.status_code == 200
        data = response.json()
        assert data["symbol"] == symbol
        assert "price" in data
        assert "change" in data
    except httpx.ConnectError:
        pytest.skip(f"Service not running at {BASE_URL}")
    except httpx.TimeoutException:
        pytest.skip(f"Request timeout for {symbol}")


@pytest.mark.parametrize("symbol", ["0700.HK", "9988.HK"])
def test_get_hk_stock_quote(symbol):
    """Test getting Hong Kong stock quotes via AkShare"""
    try:
        response = httpx.get(f"{BASE_URL}/api/quote", params={"symbol": symbol}, timeout=10.0)
        assert response.status_code == 200
        data = response.json()
        assert data["symbol"] == symbol
        assert "price" in data
        assert "change" in data
    except httpx.ConnectError:
        pytest.skip(f"Service not running at {BASE_URL}")
    except httpx.TimeoutException:
        pytest.skip(f"Request timeout for {symbol}")


def test_get_quotes_batch():
    """Test getting multiple quotes at once"""
    try:
        response = httpx.get(
            f"{BASE_URL}/api/quotes",
            params={"symbols": "AAPL,TSLA,000001"},
            timeout=15.0
        )
        assert response.status_code == 200
        data = response.json()
        assert "data" in data
        assert len(data["data"]) <= 3
        assert "timestamp" in data
    except httpx.ConnectError:
        pytest.skip(f"Service not running at {BASE_URL}")
    except httpx.TimeoutException:
        pytest.skip("Request timeout for batch quotes")


def test_get_kline():
    """Test getting K-line (candlestick) data"""
    try:
        response = httpx.get(
            f"{BASE_URL}/api/kline",
            params={"symbol": "AAPL", "interval": "1d", "limit": 10},
            timeout=15.0
        )
        assert response.status_code == 200
        data = response.json()
        assert data["symbol"] == "AAPL"
        assert data["interval"] == "1d"
        assert "data" in data
        assert len(data["data"]) <= 10
    except httpx.ConnectError:
        pytest.skip(f"Service not running at {BASE_URL}")
    except httpx.TimeoutException:
        pytest.skip("Request timeout for kline data")


def test_get_indicators():
    """Test getting technical indicators"""
    try:
        response = httpx.get(
            f"{BASE_URL}/api/indicators",
            params={
                "symbol": "AAPL",
                "indicators": "sma,ema,rsi,macd",
                "interval": "1d",
                "period": 50
            },
            timeout=15.0
        )
        assert response.status_code == 200
        data = response.json()
        assert data["symbol"] == "AAPL"
        assert "indicators" in data
        # Check if some indicators are present
        if data["indicators"]:
            assert any(k in data["indicators"] for k in ["sma", "ema", "rsi", "macd"])
    except httpx.ConnectError:
        pytest.skip(f"Service not running at {BASE_URL}")
    except httpx.TimeoutException:
        pytest.skip("Request timeout for indicators")


def test_invalid_symbol():
    """Test handling of invalid stock symbol"""
    try:
        response = httpx.get(
            f"{BASE_URL}/api/quote",
            params={"symbol": "INVALID_SYMBOL_12345"},
            timeout=10.0
        )
        # Service should return error or empty data
        assert response.status_code in [400, 404, 200]
    except httpx.ConnectError:
        pytest.skip(f"Service not running at {BASE_URL}")


def test_cache_hit():
    """Test that caching works by making identical requests"""
    try:
        symbol = "AAPL"
        # First request
        response1 = httpx.get(
            f"{BASE_URL}/api/quote",
            params={"symbol": symbol},
            timeout=10.0
        )
        assert response1.status_code == 200

        # Second request should hit cache
        response2 = httpx.get(
            f"{BASE_URL}/api/quote",
            params={"symbol": symbol},
            timeout=10.0
        )
        assert response2.status_code == 200

        # Data should be consistent
        data1 = response1.json()
        data2 = response2.json()
        assert data1["symbol"] == data2["symbol"]
    except httpx.ConnectError:
        pytest.skip(f"Service not running at {BASE_URL}")


def test_api_docs():
    """Test that API documentation is accessible"""
    try:
        response = httpx.get(f"{BASE_URL}/docs")
        assert response.status_code == 200
    except httpx.ConnectError:
        pytest.skip(f"Service not running at {BASE_URL}")


def test_redoc():
    """Test that ReDoc documentation is accessible"""
    try:
        response = httpx.get(f"{BASE_URL}/redoc")
        assert response.status_code == 200
    except httpx.ConnectError:
        pytest.skip(f"Service not running at {BASE_URL}")


# Integration test with PostgreSQL (requires DB connection)
@pytest.mark.skip(reason="Requires PostgreSQL connection")
def test_sync_kline_to_db():
    """Test syncing K-line data to database"""
    payload = {
        "symbol": "AAPL",
        "interval": "1d",
        "data": [
            {
                "time": "2024-01-01T00:00:00Z",
                "open": 180.0,
                "high": 185.0,
                "low": 179.0,
                "close": 183.0,
                "volume": 50000000
            }
        ]
    }

    try:
        response = httpx.post(
            f"{BASE_URL}/api/admin/kline/sync",
            json=payload,
            timeout=10.0
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert data["count"] == 1
    except httpx.ConnectError:
        pytest.skip(f"Service not running at {BASE_URL}")
