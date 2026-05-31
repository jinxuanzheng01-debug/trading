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
            return ChanResult(symbol=symbol, level=level)

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

        return self._extract(chan, symbol, level)

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

    def _extract(self, chan: CChan, symbol: str, level: str) -> ChanResult:
        """从 CChan 实例中提取 Bi/Seg/ZS/BSP 等结构化数据。"""
        try:
            kl_list = chan[0]  # lv_list = [lv], 所以索引 0 即该级别
        except (IndexError, KeyError) as exc:
            logger.error("Failed to access chan[0] for %s: %s", symbol, exc)
            return ChanResult(symbol=symbol, level=level)

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
                        start_time=str(bi.get_begin_klu().time),
                        end_time=str(bi.get_end_klu().time),
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
                        start_time=str(seg.start_bi.get_begin_klu().time),
                        end_time=str(seg.end_bi.get_end_klu().time),
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
                            start_time=str(zs.begin.time),
                            end_time=str(zs.end.time),
                        )
                    )
                except Exception as exc:
                    logger.debug("Skipping zs: %s", exc)
                    continue

        # ---- 买卖点（尝试 chan.py 原生计算）----
        bsp_list: list[BSPInfo] = []
        try:
            kl_list.bs_point_lst.cal(
                list(kl_list.bi_list) if kl_list.bi_list else [],
                list(kl_list.seg_list) if kl_list.seg_list else [],
            )
            bsp_points = kl_list.bs_point_lst.getSortedBspList()
        except (AttributeError, Exception) as exc:
            logger.debug("bs_point_lst unavailable: %s", exc)
            bsp_points = []

        for bsp in bsp_points:
            try:
                primary = bsp.type[0].main_type() if bsp.type else "1"
                if bsp.is_buy:
                    type_name = {"1": "一买", "2": "二买", "3": "三买"}.get(primary, f"买{primary}")
                else:
                    type_name = {"1": "一卖", "2": "二卖", "3": "三卖"}.get(primary, f"卖{primary}")
                bsp_list.append(
                    BSPInfo(
                        type=type_name,
                        price=float(bsp.klu.close),
                        time=str(bsp.klu.time),
                        confidence=0.8,
                    )
                )
            except Exception as exc:
                logger.debug("Skipping bsp: %s", exc)
                continue

        # ---- 启发式买卖点（chan.py BSP 为空时的补充规则）----
        if not bsp_list and zs_list and bi_list:
            heuristic = _heuristic_bsp(zs_list, bi_list, level)
            bsp_list.extend(heuristic)

        summary = self._build_summary(zs_list, bsp_list, bi_list)

        return ChanResult(
            symbol=symbol,
            level=level,
            bi_list=bi_list,
            seg_list=seg_list,
            zs_list=zs_list,
            bsp_list=bsp_list,
            summary=summary,
        )

    @staticmethod
    def _build_summary(
        zs_list: list[ZSInfo],
        bsp_list: list[BSPInfo],
        bi_list: list[BiInfo],
    ) -> str:
        """生成一句话结构摘要。"""
        parts: list[str] = []

        if zs_list:
            latest_zs = zs_list[-1]
            parts.append(f"当前处于{latest_zs.level}{latest_zs.type}")

        if bi_list:
            last_bi = bi_list[-1]
            parts.append(f"最后一笔为{last_bi.direction}笔")

        if bsp_list:
            bsp_names = [b.type for b in bsp_list[-2:]]
            parts.append(f"最近买卖点: {', '.join(bsp_names)}")

        return "，".join(parts) if parts else "无显著结构"


def _heuristic_bsp(
    zs_list: list[ZSInfo],
    bi_list: list[BiInfo],
    level: str,
) -> list[BSPInfo]:
    """基于中枢和笔的简单形态识别，补充 chan.py 不输出 BSP 时的买卖点判断。

    只检测一买/一卖（离开中枢后反向笔），二买/二卖（回踩中枢不破）。
    """
    result: list[BSPInfo] = []
    if len(bi_list) < 2 or len(zs_list) < 1:
        return result

    last_bi = bi_list[-1]
    prev_bi = bi_list[-2]
    last_zs = zs_list[-1]

    # 一买：向下笔跌破中枢下沿后，出现向上笔
    if prev_bi.direction == "down" and last_bi.direction == "up":
        if prev_bi.end_price < last_zs.zd:
            result.append(BSPInfo(
                type="一买",
                price=last_bi.start_price,
                time=last_bi.start_time,
                confidence=0.6,
            ))

    # 一卖：向上笔突破中枢上沿后，出现向下笔
    if prev_bi.direction == "up" and last_bi.direction == "down":
        if prev_bi.end_price > last_zs.zg:
            result.append(BSPInfo(
                type="一卖",
                price=last_bi.start_price,
                time=last_bi.start_time,
                confidence=0.6,
            ))

    # 二买：向下笔回到中枢区间（zd~zg），未跌破 zd，然后向上
    if prev_bi.direction == "down" and last_bi.direction == "up":
        if last_zs.zd <= prev_bi.end_price <= last_zs.zg:
            result.append(BSPInfo(
                type="二买",
                price=last_bi.start_price,
                time=last_bi.start_time,
                confidence=0.5,
            ))

    # 二卖：向上笔回到中枢区间，未突破 zg，然后向下
    if prev_bi.direction == "up" and last_bi.direction == "down":
        if last_zs.zd <= prev_bi.end_price <= last_zs.zg:
            result.append(BSPInfo(
                type="二卖",
                price=last_bi.start_price,
                time=last_bi.start_time,
                confidence=0.5,
            ))

    # 三买：向下笔回踩不破中枢上沿 ZG，然后向上笔
    if prev_bi.direction == "down" and last_bi.direction == "up":
        if prev_bi.end_price > last_zs.zg:
            result.append(BSPInfo(
                type="三买",
                price=last_bi.start_price,
                time=last_bi.start_time,
                confidence=0.55,
            ))

    # 三卖：向上笔反弹不破中枢下沿 ZD，然后向下笔
    if prev_bi.direction == "up" and last_bi.direction == "down":
        if prev_bi.end_price < last_zs.zd:
            result.append(BSPInfo(
                type="三卖",
                price=last_bi.start_price,
                time=last_bi.start_time,
                confidence=0.55,
            ))

    # 如果价格已远离最后一个中枢，检查更早的中枢
    if not result and len(zs_list) >= 2:
        for older_zs in reversed(zs_list[:-1]):
            if prev_bi.direction == "down" and last_bi.direction == "up":
                if prev_bi.end_price > older_zs.zg:
                    result.append(BSPInfo(
                        type="三买",
                        price=last_bi.start_price,
                        time=last_bi.start_time,
                        confidence=0.4,
                    ))
                    break
            if prev_bi.direction == "up" and last_bi.direction == "down":
                if prev_bi.end_price < older_zs.zd:
                    result.append(BSPInfo(
                        type="三卖",
                        price=last_bi.start_price,
                        time=last_bi.start_time,
                        confidence=0.4,
                    ))
                    break

    return result
