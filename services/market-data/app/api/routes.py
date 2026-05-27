from fastapi import APIRouter, HTTPException, Query
from datetime import datetime
from typing import List
from sqlalchemy.ext.asyncio import AsyncSession
from .models import (
    QuoteData, QuotesResponse, KlineResponse, IndicatorsResponse, HealthResponse,
    StockInfo, StockMetrics, StockDetailResponse
)
from ..services.yfinance_client import YFinanceClient
from ..services.akshare_client import AkShareClient
from ..services.cache import cache
from ..services.indicators import IndicatorsCalculator
from ..db.models import OHLCV, SyncLog
from ..db.connection import async_session

router = APIRouter(prefix="/api")

# Health check without /api prefix - will be mounted separately
health_router = APIRouter()

# Initialize data source clients
yf_client = YFinanceClient()
aks_client = AkShareClient()




def get_client(symbol: str):
    """根据标的代码选择合适的客户端"""
    # 优先使用 AkShare（A股、港股）
    if aks_client.supports_market(symbol):
        return aks_client
    # 其他使用 yfinance（美股）
    return yf_client


@health_router.get("/health", response_model=HealthResponse)
async def health_check():
    response = HealthResponse(status="ok", timestamp=datetime.utcnow().isoformat())
    return response


@router.get("/quote", response_model=QuoteData)
async def get_quote(symbol: str = Query(..., description="股票代码，如 AAPL, 000001, 0700.HK")):
    # 先查缓存
    cached = await cache.get_quote(symbol)
    if cached:
        return QuoteData(**cached)

    # 获取实时数据
    client = get_client(symbol)
    quote = await client.get_quote(symbol)

    # 写入缓存
    await cache.set_quote(symbol, quote.model_dump())

    return quote


@router.get("/quotes", response_model=QuotesResponse)
async def get_quotes(symbols: str = Query(..., description="逗号分隔的股票代码")):
    symbol_list = [s.strip() for s in symbols.split(",")][:50]  # 最多50个

    # 先查缓存
    cached = await cache.get_quotes(symbol_list)
    if cached:
        return QuotesResponse(**cached)

    # 分组获取（A股/港股用 AkShare，美股用 yfinance）
    aks_symbols = [s for s in symbol_list if aks_client.supports_market(s)]
    yf_symbols = [s for s in symbol_list if s not in aks_symbols]

    results = []
    if aks_symbols:
        results.extend(await aks_client.get_quotes(aks_symbols))
    if yf_symbols:
        results.extend(await yf_client.get_quotes(yf_symbols))

    response = QuotesResponse(data=results, timestamp=datetime.utcnow().isoformat())

    # 写入缓存
    await cache.set_quotes(symbol_list, response.model_dump())

    return response


@router.get("/stock/{symbol}", response_model=StockDetailResponse)
async def get_stock_detail(symbol: str):
    """获取股票详细信息，包括公司信息和关键指标"""
    import asyncio
    from ..services.yfinance_client import safe_float

    client = get_client(symbol)

    # 获取报价数据
    quote = await client.get_quote(symbol)

    # 从 yfinance 获取扩展信息（仅支持美股）
    if hasattr(client, '_get_ticker'):
        ticker = await asyncio.to_thread(client._get_ticker, symbol)
        info = await asyncio.to_thread(lambda: ticker.info)

        # 构建股票信息
        stock_info = StockInfo(
            symbol=symbol,
            name=info.get("longName") or info.get("shortName") or symbol,
            sector=info.get("sector"),
            industry=info.get("industry"),
            website=info.get("website"),
            country=info.get("country"),
            currency=info.get("currency", "USD")
        )

        # 构建指标
        metrics = StockMetrics(
            marketCap=safe_float(info.get("marketCap")),
            trailingPE=safe_float(info.get("trailingPE")),
            forwardPE=safe_float(info.get("forwardPE")),
            priceToBook=safe_float(info.get("priceToBook")),
            beta=safe_float(info.get("beta")),
            fiftyTwoWeekHigh=safe_float(info.get("fiftyTwoWeekHigh")),
            fiftyTwoWeekLow=safe_float(info.get("fiftyTwoWeekLow")),
            dividendRate=safe_float(info.get("dividendRate")),
            dividendYield=safe_float(info.get("dividendYield"))
        )

        return StockDetailResponse(
            info=stock_info,
            quote=quote,
            metrics=metrics
        )

    # 无扩展信息时的后备方案（A股/港股）
    return StockDetailResponse(
        info=StockInfo(
            symbol=symbol,
            name=quote.name,
            currency=quote.currency or "USD"
        ),
        quote=quote,
        metrics=StockMetrics()
    )


@router.get("/kline", response_model=KlineResponse)
async def get_kline(
    symbol: str = Query(..., description="股票代码"),
    interval: str = Query("1d", description="时间周期: 1d(日线), 1w(周线), 1M(月线)"),
    limit: int = Query(100, description="返回数量", le=500)
):
    # 验证interval参数
    valid_intervals = ["1d", "1w", "1M"]
    if interval not in valid_intervals:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid interval '{interval}'. Must be one of: {', '.join(valid_intervals)}"
        )
    # 先查缓存
    cached = await cache.get_kline(symbol, interval)
    if cached:
        return KlineResponse(**cached)

    # 获取K线数据
    client = get_client(symbol)
    klines = await client.get_kline(symbol, interval, limit)

    response = KlineResponse(symbol=symbol, interval=interval, data=klines)

    # 写入缓存
    await cache.set_kline(symbol, interval, response.model_dump())

    # datetime serialization handled by Pydantic validators
    return response


@router.get("/indicators", response_model=IndicatorsResponse)
async def get_indicators(
    symbol: str = Query(..., description="股票代码"),
    indicators: str = Query(..., description="逗号分隔的指标名称"),
    interval: str = Query("1d", description="时间周期"),
    period: int = Query(100, description="数据周期数")
):
    indicator_list = [i.strip() for i in indicators.split(",")]

    # 获取K线数据
    client = get_client(symbol)
    klines = await client.get_kline(symbol, interval, period)

    if not klines:
        raise HTTPException(status_code=404, detail=f"No data found for {symbol}")

    # 计算指标
    calculator = IndicatorsCalculator(klines)
    result = calculator.calculate_all(indicator_list)

    return IndicatorsResponse(
        symbol=symbol,
        interval=interval,
        indicators=result
    )


@router.post("/admin/kline/sync")
async def sync_kline(data: dict):
    """写入K线数据（由定时任务服务调用）"""
    symbol = data.get("symbol")
    interval = data.get("interval", "1d")
    klines_data = data.get("data", [])

    async with async_session() as session:
        count = 0
        for k in klines_data:
            ohlcv = OHLCV(
                time=datetime.fromisoformat(k['time'].replace('Z', '+00:00')),
                symbol=symbol,
                interval=interval,
                open=k['open'],
                high=k['high'],
                low=k['low'],
                close=k['close'],
                volume=k['volume']
            )
            # 使用 merge 处理重复数据
            await session.merge(ohlcv)
            count += 1

        await session.commit()

        # 记录同步日志
        if klines_data:
            log = SyncLog(
                symbol=symbol,
                interval=interval,
                start_date=datetime.fromisoformat(klines_data[0]['time'].replace('Z', '+00:00')),
                end_date=datetime.fromisoformat(klines_data[-1]['time'].replace('Z', '+00:00')),
                records_count=count,
                status="success"
            )
            await session.add(log)
            await session.commit()

    return {"status": "ok", "count": count}
