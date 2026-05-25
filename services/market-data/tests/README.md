# Market Data Service - Testing Guide

This directory contains end-to-end tests for the Market Data Service API.

## Prerequisites

### Required Services

1. **PostgreSQL** - Stores historical OHLCV data
2. **Redis** - Caches API responses

### Starting Services

```bash
# From project root
cd /Users/xuan/Documents/trading-agent

# Start PostgreSQL and Redis using Docker Compose
docker-compose up -d postgres redis

# Verify services are running
docker-compose ps
```

## Running Tests

### Step 1: Start the Market Data Service

```bash
cd services/market-data

# Install dependencies (if not already done)
pip install -r requirements.txt

# Copy and configure environment variables
cp .env.example .env
# Edit .env with your Redis/PostgreSQL connection details

# Start the service (default port: 8000)
python -m app.main
```

The service should start at `http://localhost:8000`

### Step 2: Run Tests

In a new terminal:

```bash
cd services/market-data

# Install pytest if not already installed
pip install pytest httpx

# Run all tests
pytest tests/test_api.py -v

# Run specific test
pytest tests/test_api.py::test_health_check -v

# Run with coverage
pip install pytest-cov
pytest tests/test_api.py --cov=app --cov-report=html
```

## Test Coverage

| Test Category | Tests | Description |
|--------------|-------|-------------|
| Health Check | `test_health_check` | Verifies service is running |
| US Stocks | `test_get_us_stock_quote` | Tests AAPL, TSLA, MSFT |
| A-Shares | `test_get_a_stock_quote` | Tests 000001, 600000, 600519 |
| HK Stocks | `test_get_hk_stock_quote` | Tests 0700.HK, 9988.HK |
| Batch Quotes | `test_get_quotes_batch` | Tests multiple symbols at once |
| K-Line Data | `test_get_kline` | Tests candlestick data retrieval |
| Indicators | `test_get_indicators` | Tests technical indicators |
| Error Handling | `test_invalid_symbol` | Tests invalid symbol handling |
| Caching | `test_cache_hit` | Tests Redis cache functionality |
| Documentation | `test_api_docs`, `test_redoc` | Tests API documentation endpoints |

## Manual Testing

### Quick API Tests with curl

```bash
# Health check
curl http://localhost:8000/health

# Get US stock quote
curl "http://localhost:8000/api/quote?symbol=AAPL"

# Get A-share quote
curl "http://localhost:8000/api/quote?symbol=000001"

# Get multiple quotes
curl "http://localhost:8000/api/quotes?symbols=AAPL,TSLA,000001"

# Get K-line data
curl "http://localhost:8000/api/kline?symbol=AAPL&interval=1d&limit=10"

# Get technical indicators
curl "http://localhost:8000/api/indicators?symbol=AAPL&indicators=sma,ema,rsi,macd&period=50"
```

## Troubleshooting

### Service Not Running

If tests fail with "Service not running":
```bash
# Check if the service is running
curl http://localhost:8000/health

# Check logs
cd services/market-data
python -m app.main
```

### Redis Connection Error

```bash
# Verify Redis is running
docker-compose ps redis

# Check Redis connection
redis-cli ping
```

### PostgreSQL Connection Error

```bash
# Verify PostgreSQL is running
docker-compose ps postgres

# Check database connection
psql -h localhost -U admin -d trading_agent
```

### Timeout Errors

Some tests may timeout due to:
- Slow network connection to data sources (Yahoo Finance, AkShare)
- Rate limiting from external APIs
- First request without cache (cold start)

## CI/CD Integration

To run tests in CI/CD:

```yaml
# .github/workflows/test.yml example
- name: Start services
  run: docker-compose up -d postgres redis

- name: Install dependencies
  run: pip install -r requirements.txt pytest httpx

- name: Run tests
  run: pytest tests/test_api.py -v --timeout=60
```

## Adding New Tests

To add new tests:

1. Create a new test function in `test_api.py`
2. Use `@pytest.mark.parametrize` for multiple test cases
3. Handle connection errors gracefully with try/except
4. Use `pytest.skip` for tests that require specific conditions

```python
def test_new_feature():
    try:
        response = httpx.get(f"{BASE_URL}/api/new-endpoint")
        assert response.status_code == 200
    except httpx.ConnectError:
        pytest.skip("Service not running")
```

## Test Status

- Created: 2026-05-21
- Ready to run: Yes
- Services required: PostgreSQL, Redis
- External dependencies: yfinance, akshare (network access required)
