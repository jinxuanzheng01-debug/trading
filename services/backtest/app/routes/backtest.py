from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import pandas as pd
import httpx
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from engine.core import BacktestEngine
from engine.strategies import IndicatorStrategy

router = APIRouter(prefix="/api")
MARKET_DATA_URL = os.environ.get("MARKET_DATA_URL", "http://market-data:8000")


class BacktestRequest(BaseModel):
    strategy_code: str
    ticker: str
    start_date: str
    end_date: str
    initial_capital: float = 1000000.0
    fee_model: str = "a_stock"


@router.post("/run")
async def run_backtest(req: BacktestRequest):
    try:
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

        local_ns = {"pd": pd, "np": __import__("numpy"), "IndicatorStrategy": IndicatorStrategy}
        exec(req.strategy_code, local_ns)

        strategy_class = None
        for v in local_ns.values():
            if isinstance(v, type) and issubclass(v, IndicatorStrategy) and v is not IndicatorStrategy:
                strategy_class = v
                break

        if not strategy_class:
            raise HTTPException(status_code=400, detail="No IndicatorStrategy subclass found")

        engine = BacktestEngine(strategy_class(), df, req.initial_capital, req.fee_model)
        result = engine.run()
        return {"status": "completed", **result}

    except HTTPException:
        raise
    except Exception as e:
        return {"status": "failed", "error": str(e)}


@router.get("/health")
async def health():
    return {"status": "ok"}
