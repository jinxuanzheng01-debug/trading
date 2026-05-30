"""数据适配：pandas DataFrame → chan.py CKLine_Unit 序列。"""

from __future__ import annotations

import sys
from pathlib import Path
from datetime import datetime

import pandas as pd

# 将 lib/chan.py 加入 sys.path
_LIB = Path(__file__).parent.parent.parent.parent / "lib" / "chan.py"
if str(_LIB) not in sys.path:
    sys.path.insert(0, str(_LIB))

from Chan import CChan
from ChanConfig import CChanConfig
from Common.CEnum import DATA_FIELD
from Common.CTime import CTime
from KLine.KLine_Unit import CKLine_Unit


def _to_ctime(ts) -> CTime:
    """将 pandas Timestamp / datetime / str 转为 CTime。"""
    if hasattr(ts, "year"):
        return CTime(ts.year, ts.month, ts.day, ts.hour, ts.minute, ts.second)
    dt = ts if isinstance(ts, datetime) else datetime.fromisoformat(str(ts))
    return CTime(dt.year, dt.month, dt.day, dt.hour, dt.minute, dt.second)


def df_to_kl_units(df: pd.DataFrame) -> list[CKLine_Unit]:
    """将 pandas DataFrame (DatetimeIndex, open/high/low/close/volume) 转为 CKLine_Unit 列表。"""
    units: list[CKLine_Unit] = []
    for _, (ts, row) in enumerate(df.iterrows()):
        units.append(CKLine_Unit({
            DATA_FIELD.FIELD_TIME: _to_ctime(ts),
            DATA_FIELD.FIELD_OPEN: float(row["open"]),
            DATA_FIELD.FIELD_HIGH: float(row["high"]),
            DATA_FIELD.FIELD_LOW: float(row["low"]),
            DATA_FIELD.FIELD_CLOSE: float(row["close"]),
            DATA_FIELD.FIELD_VOLUME: float(row["volume"]),
        }))
    return units
