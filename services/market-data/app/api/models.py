from pydantic import BaseModel
from datetime import datetime
from decimal import Decimal
from typing import List, Optional


class QuoteData(BaseModel):
    symbol: str
    name: Optional[str] = None
    price: float
    change: float
    changePercent: float
    volume: Optional[int] = None
    high: Optional[float] = None
    low: Optional[float] = None
    open: Optional[float] = None
    previousClose: Optional[float] = None
    marketCap: Optional[int] = None
    currency: Optional[str] = "USD"
    timestamp: datetime


class QuotesResponse(BaseModel):
    data: List[QuoteData]
    timestamp: datetime


class KlineData(BaseModel):
    time: datetime
    open: float
    high: float
    low: float
    close: float
    volume: int


class KlineResponse(BaseModel):
    symbol: str
    interval: str
    data: List[KlineData]


class IndicatorsResponse(BaseModel):
    symbol: str
    interval: str
    indicators: dict


class HealthResponse(BaseModel):
    status: str
    timestamp: datetime


class ErrorResponse(BaseModel):
    error: str
    code: str
    message: str
