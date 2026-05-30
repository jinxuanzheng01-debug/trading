"""缠论分析输出模型。"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class BiInfo:
    """笔信息。"""
    direction: str          # "up" | "down"
    start_time: str
    end_time: str
    start_price: float
    end_price: float
    strength: float = 0.0   # 笔的幅度百分比


@dataclass
class SegInfo:
    """线段信息。"""
    direction: str
    start_time: str
    end_time: str
    start_price: float
    end_price: float
    bi_count: int = 0       # 包含的笔数量


@dataclass
class ZSInfo:
    """中枢信息。"""
    type: str               # "上涨中枢" | "下跌中枢"
    level: str               # "日线" | "30分钟"
    high: float
    low: float
    zg: float                # 中枢上沿
    zd: float                # 中枢下沿
    start_time: str
    end_time: str


@dataclass
class BSPInfo:
    """买卖点信息。"""
    type: str                # "一买" | "一卖" | "二买" | "二卖" | "三买" | "三卖"
    price: float
    time: str
    confidence: float = 0.0  # 0-1


@dataclass
class DivergenceInfo:
    """背驰信息。"""
    type: str                # "顶背驰" | "底背驰"
    level: str
    detail: str


@dataclass
class ChanResult:
    """缠论分析完整结果。"""
    symbol: str
    level: str
    bi_list: list[BiInfo] = field(default_factory=list)
    seg_list: list[SegInfo] = field(default_factory=list)
    zs_list: list[ZSInfo] = field(default_factory=list)
    bsp_list: list[BSPInfo] = field(default_factory=list)
    divergence: DivergenceInfo | None = None
    summary: str = ""
