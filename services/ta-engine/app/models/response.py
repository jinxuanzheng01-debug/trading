from pydantic import BaseModel
from typing import Dict, List, Optional, Any


class DimensionScore(BaseModel):
    score: float
    signal: str
    confidence: float
    active_signals: List[Dict[str, Any]]


class TechnicalAnalysisResult(BaseModel):
    symbol: str
    overall_score: float
    signal: str
    confidence: float
    dimensions: Dict[str, DimensionScore]
    active_signals: List[Dict[str, Any]]
    factors: Dict[str, Optional[Any]]
    indicators: Dict[str, Optional[Any]]
