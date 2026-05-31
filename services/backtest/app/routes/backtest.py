from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import pandas as pd
import httpx
import os

from app.engine.core import BacktestEngine
from app.engine.strategies import get_strategy_template

router = APIRouter(prefix="/api")
MARKET_DATA_URL = os.environ.get("MARKET_DATA_URL", "http://market-data:8000")


class BacktestRequest(BaseModel):
    strategy_name: str  # 策略名称，如 "ma_cross", "macd", "rsi"
    ticker: str
    start_date: str
    end_date: str
    initial_capital: float = 1000000.0
    fee_model: str = "us_stock"
    params: dict = {}  # 策略参数


@router.post("/run")
async def run_backtest(req: BacktestRequest):
    try:
        # 获取策略模板
        strategy_class = get_strategy_template(req.strategy_name)
        if not strategy_class:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown strategy: {req.strategy_name}. "
                       f"Available: ma_cross, macd, rsi, bollinger"
            )

        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(f"{MARKET_DATA_URL}/api/kline",
                                    params={"symbol": req.ticker, "interval": "1d", "limit": 500})
            resp.raise_for_status()
            kline_data = resp.json()

        if not kline_data.get("data"):
            raise HTTPException(status_code=404, detail="No kline data")

        df = pd.DataFrame(kline_data["data"])
        df["time"] = pd.to_datetime(df["time"])
        df = df.set_index("time")
        for col in ["open", "high", "low", "close", "volume"]:
            df[col] = pd.to_numeric(df[col], errors="coerce")

        df = df[req.start_date:req.end_date]
        if len(df) < 10:
            raise HTTPException(status_code=400, detail="Insufficient data")

        # 使用策略参数初始化
        strategy = strategy_class(**req.params) if req.params else strategy_class()
        engine = BacktestEngine(strategy, df, req.initial_capital, req.fee_model)
        result = engine.run()
        return {"status": "completed", **result}

    except HTTPException:
        raise
    except Exception as e:
        return {"status": "failed", "error": str(e)}


@router.get("/health")
async def health():
    return {"status": "ok"}
