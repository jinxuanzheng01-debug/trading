from pydantic import BaseModel
from typing import Optional


class AnalyzeRequest(BaseModel):
    symbol: str
    market: str = "us"
    period: str = "1d"
