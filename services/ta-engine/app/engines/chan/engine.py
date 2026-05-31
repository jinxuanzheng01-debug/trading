"""ChanEngine: 缠论分析引擎，独立于 BaseEngine pipeline。"""

from __future__ import annotations

import sys
from pathlib import Path
import logging

import pandas as pd

_LIB = Path(__file__).parent.parent.parent.parent / "lib" / "chan.py"
if str(_LIB) not in sys.path:
    sys.path.insert(0, str(_LIB))

from Chan import CChan
from ChanConfig import CChanConfig
from Common.CEnum import KL_TYPE, AUTYPE

from .config import CHAN_DEFAULT_CONFIG
from .adapter import df_to_kl_units
from .models import ChanResult, BiInfo, SegInfo, ZSInfo, BSPInfo, DivergenceInfo

logger = logging.getLogger(__name__)


class ChanEngine:
    """缠论分析引擎。独立于 BaseEngine pipeline，直接消费 OHLCV DataFrame。"""

    def __init__(self, config: dict | None = None):
        cfg = dict(CHAN_DEFAULT_CONFIG)
        # trigger_step=True 是必要的，构造 CChan 时不自动加载数据，
        # 而是通过 trigger_load() 注入自定义 K 线数据。
        cfg["trigger_step"] = True
        if config:
            cfg.update(config)
        self.config = CChanConfig(cfg)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def analyze(self, df: pd.DataFrame, symbol: str, level: str = "1d") -> ChanResult:
        """对 DataFrame 执行缠论分析，返回结构化结果。

        Parameters
        ----------
        df : pd.DataFrame
            必须包含 open / high / low / close / volume 列，DatetimeIndex。
        symbol : str
            标的代码（仅用于标识）。
        level : str
            K 线级别，如 "1d", "60m", "30m", "15m", "5m", "1m"。

        Returns
        -------
        ChanResult
            包含 bi_list / seg_list / zs_list / bsp_list / summary 等字段。
        """
        kl_units = df_to_kl_units(df)

        if len(kl_units) < 10:
            logger.warning("Insufficient K-lines for %s: %d", symbol, len(kl_units))
            return ChanResult(symbol=symbol, level=level, kline_from=kline_from, kline_to=kline_to)

        lv = self._level_to_kl_type(level)

        # CChan 构造；由于 trigger_step=True，__init__ 不会触发 load()
        chan = CChan(
            code=symbol,
            begin_time=None,
            end_time=None,
            data_src="custom:CommonStockAPI.CCommonStockApi",
            lv_list=[lv],
            config=self.config,
            autype=AUTYPE.NONE,
        )

        # 注入自定义 K 线数据 —— 替代 data_src 的加载流程
        chan.trigger_load({lv: kl_units})

        # trigger_step 模式下 cal_seg_and_zs 仅在笔变化时增量调用，
        # 但最后一条 K 线可能不足以触发一次完整的重算，因此手动补算一次。
        for _lv in chan.lv_list:
            chan.kl_datas[_lv].cal_seg_and_zs()
            # 同样需要手动触发买卖点计算
            try:
                klist = chan.kl_datas[_lv]
                chan.kl_datas[_lv].bs_point_lst.cal(
                    list(klist.bi_list) if klist.bi_list else [],
                    list(klist.seg_list) if klist.seg_list else [],
                )
            except Exception:
                logger.debug("BSP calculation skipped for %s", _lv, exc_info=True)

        kline_from = df.index[0].strftime("%Y-%m-%d") if hasattr(df.index[0], "strftime") else str(df.index[0])[:10]
        kline_to = df.index[-1].strftime("%Y-%m-%d") if hasattr(df.index[-1], "strftime") else str(df.index[-1])[:10]
        last_close = float(df.iloc[-1]["close"])
        return self._extract(chan, symbol, level, kline_from, kline_to, last_close)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _level_to_kl_type(level: str) -> KL_TYPE:
        mapping = {
            "1d": KL_TYPE.K_DAY,
            "1w": KL_TYPE.K_WEEK,
            "1m": KL_TYPE.K_MON,
            "60m": KL_TYPE.K_60M,
            "30m": KL_TYPE.K_30M,
            "15m": KL_TYPE.K_15M,
            "5m": KL_TYPE.K_5M,
            "1m": KL_TYPE.K_1M,
        }
        try:
            return mapping[level]
        except KeyError:
            logger.warning("Unknown level %r, falling back to K_DAY", level)
            return KL_TYPE.K_DAY

    @staticmethod
    def _fmt_time(ct) -> str:
        """将 CTime 转为统一格式 YYYY-MM-DD HH:MM:SS+00。"""
        return f"{ct.year:04d}-{ct.month:02d}-{ct.day:02d} {ct.hour:02d}:{ct.minute:02d}:00+00"

    def _extract(self, chan: CChan, symbol: str, level: str, kline_from: str = "", kline_to: str = "", last_close: float = 0.0) -> ChanResult:
        """从 CChan 实例中提取 Bi/Seg/ZS/BSP 等结构化数据。"""
        try:
            kl_list = chan[0]  # lv_list = [lv], 所以索引 0 即该级别
        except (IndexError, KeyError) as exc:
            logger.error("Failed to access chan[0] for %s: %s", symbol, exc)
            return ChanResult(symbol=symbol, level=level, kline_from=kline_from, kline_to=kline_to)

        # ---- 笔 ----
        bi_list: list[BiInfo] = []
        for bi in getattr(kl_list, "bi_list", []) or []:
            try:
                begin_val = float(bi.get_begin_val())
                end_val = float(bi.get_end_val())
                strength = (
                    round(abs(end_val - begin_val) / begin_val * 100, 2)
                    if begin_val
                    else 0.0
                )
                bi_list.append(
                    BiInfo(
                        direction="up" if bi.is_up() else "down",
                        start_time=self._fmt_time(bi.get_begin_klu().time),
                        end_time=self._fmt_time(bi.get_end_klu().time),
                        start_price=begin_val,
                        end_price=end_val,
                        strength=strength,
                    )
                )
            except Exception as exc:
                logger.debug("Skipping bi: %s", exc)
                continue

        # ---- 线段 ----
        seg_list: list[SegInfo] = []
        for seg in getattr(kl_list, "seg_list", []) or []:
            try:
                seg_list.append(
                    SegInfo(
                        direction="up" if seg.is_up() else "down",
                        start_time=self._fmt_time(seg.start_bi.get_begin_klu().time),
                        end_time=self._fmt_time(seg.end_bi.get_end_klu().time),
                        start_price=float(seg.get_begin_val()),
                        end_price=float(seg.get_end_val()),
                        bi_count=len(getattr(seg, "bi_list", []) or []),
                    )
                )
            except Exception as exc:
                logger.debug("Skipping seg: %s", exc)
                continue

        # ---- 中枢（挂在每个线段上） ----
        # CZS.high = ZG（中枢上沿，min of constituent highs）
        # CZS.low  = ZD（中枢下沿，max of constituent lows）
        zs_list: list[ZSInfo] = []
        for seg in getattr(kl_list, "seg_list", []) or []:
            seg_is_up = seg.is_up() if hasattr(seg, "is_up") else True
            for zs in getattr(seg, "zs_lst", []) or []:
                try:
                    zs_list.append(
                        ZSInfo(
                            type="上涨中枢" if seg_is_up else "下跌中枢",
                            level=level,
                            high=float(zs.high),
                            low=float(zs.low),
                            zg=float(zs.high),
                            zd=float(zs.low),
                            start_time=self._fmt_time(zs.begin.time),
                            end_time=self._fmt_time(zs.end.time),
                        )
                    )
                except Exception as exc:
                    logger.debug("Skipping zs: %s", exc)
                    continue

        # 买卖点交给 LLM 判断，这里只保留原始结构数据
        bsp_list: list[BSPInfo] = []

        summary = self._build_summary(zs_list, bi_list)

        return ChanResult(
            symbol=symbol,
            level=level,
            kline_from=kline_from,
            kline_to=kline_to,
            last_close=last_close,
            bi_list=bi_list,
            seg_list=seg_list,
            zs_list=zs_list,
            bsp_list=bsp_list,
            summary=summary,
        )

    @staticmethod
    def _build_summary(
        zs_list: list[ZSInfo],
        bi_list: list[BiInfo],
    ) -> str:
        """生成一句话结构摘要。"""
        parts: list[str] = []

        if zs_list:
            latest_zs = zs_list[-1]
            parts.append(f"当前处于{latest_zs.level}{latest_zs.type}")

        if bi_list:
            last_bi = bi_list[-1]
            parts.append(f"最后一笔为{last_bi.direction}笔（截至{last_bi.end_time[:10]}）")

        return "，".join(parts) if parts else "无显著结构"
