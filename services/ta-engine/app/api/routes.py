from fastapi import APIRouter, HTTPException
from datetime import datetime

from ..models.request import AnalyzeRequest
from ..services.analyzer import Analyzer
from ..services.data_fetcher import DataFetcher
from ..engines.chan.engine import ChanEngine

router = APIRouter(prefix="/api")
health_router = APIRouter()

analyzer = Analyzer()
fetcher = DataFetcher()
chan_engine = ChanEngine()


@health_router.get("/health")
async def health_check():
    return {"status": "ok", "timestamp": datetime.utcnow().isoformat()}


@router.post("/analyze")
async def analyze(req: AnalyzeRequest):
    """执行完整技术面分析。"""
    try:
        df = await fetcher.fetch_kline(req.symbol, req.period)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch kline data: {str(e)}")

    if df.empty or len(df) < 60:
        raise HTTPException(status_code=422, detail=f"Insufficient data for {req.symbol}")

    result = analyzer.analyze_dataframe(req.symbol, df)
    return result


@router.get("/factors")
async def get_factors(symbol: str, period: str = "1d"):
    """仅返回因子值，不包含策略评分。"""
    try:
        df = await fetcher.fetch_kline(symbol, period)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch kline data: {str(e)}")

    from ..core.factors import FactorCalculator
    factors = FactorCalculator(df).compute_all()
    return {"symbol": symbol, "factors": factors}


@router.get("/chan/analyze")
async def chan_analyze(symbol: str, period: str = "1d"):
    """缠论分析：返回笔、线段、中枢、买卖点。"""
    try:
        df = await fetcher.fetch_kline(symbol, period)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch kline data: {str(e)}")

    if df.empty or len(df) < 30:
        raise HTTPException(status_code=422, detail=f"Insufficient data for {symbol}")

    result = chan_engine.analyze(df, symbol, period)
    return result
