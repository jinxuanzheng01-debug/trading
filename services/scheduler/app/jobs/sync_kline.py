"""
K线数据同步任务

从数据服务获取自选标的的K线数据，并存储到时序数据库
"""
import asyncio
import logging
from typing import List
from datetime import datetime

from ..clients.backend_api import backend_api
from ..clients.data_api import data_api

logger = logging.getLogger(__name__)

# 控频：每次请求间隔（秒），yfinance 免费 API 限制较严格
REQUEST_DELAY = 2.0

# 数据过期阈值：超过此时间才重新从外部API拉取
STALE_HOURS = {
    "1d": 24,   # 日线：24小时内更新过就跳过（每天收盘后才有新数据）
    "1w": 48,   # 周线：48小时
    "1M": 72,   # 月线：72小时
}


async def _should_skip_external_fetch(symbol: str, interval: str) -> bool:
    """检查本地是否已有最新数据，有则跳过外部API调用"""
    try:
        result = await backend_api.get_latest_kline(symbol, interval)
        latest = result.get("latest_at")
        if not latest:
            return False  # 没有本地数据，需要拉取

        from datetime import datetime, timedelta, timezone
        latest_dt = datetime.fromisoformat(latest.replace("Z", "+00:00"))
        threshold = timedelta(hours=STALE_HOURS.get(interval, 12))
        if datetime.now(timezone.utc) - latest_dt < threshold:
            logger.info(f"Skipping {interval} for {symbol}: local data is recent ({latest})")
            return True
    except Exception as e:
        logger.warning(f"Failed to check latest kline for {symbol}/{interval}: {e}")
    return False


async def sync_all_stock_klines():
    """
    同步所有已知股票的K线数据（每天早上6点）

    流程:
    1. 从 stocks 表获取所有股票代码
    2. 对每个标的，先查本地最新数据，有则跳过
    3. 无则从 market-data 获取，写入 stock_quote_history
    """
    logger.info("Starting kline sync job...")

    # 获取 stocks 表中所有股票（不再依赖自选股列表）
    symbols = await backend_api.get_all_stock_symbols()

    if not symbols:
        logger.warning("No symbols found in watchlist, skipping sync")
        return

    logger.info(f"Found {len(symbols)} symbols to sync: {symbols}")

    # K线周期配置: [周期代码, 描述]
    intervals = [
        ("1d", "日线"),
        ("1w", "周线"),
        ("1M", "月线"),
    ]

    success_count = 0
    error_count = 0

    for symbol in symbols:
        for interval, desc in intervals:
            try:
                # 先检查本地是否已有最新数据
                if await _should_skip_external_fetch(symbol, interval):
                    success_count += 1
                    continue

                logger.info(f"Syncing {desc} kline for {symbol}...")

                # 获取K线数据
                result = await data_api.get_kline(
                    symbol=symbol, interval=interval, limit=252
                )

                kline_data = result.get("data", [])

                if not kline_data:
                    logger.warning(f"No {desc} kline data for {symbol}")
                    continue

                # 同步到数据库
                sync_result = await data_api.sync_kline(symbol, interval, kline_data)

                if sync_result.get("success"):
                    success_count += 1
                    logger.info(
                        f"Successfully synced {len(kline_data)} {desc} records for {symbol}"
                    )
                else:
                    error_count += 1
                    logger.error(
                        f"Failed to sync {desc} for {symbol}: {sync_result.get('error')}"
                    )

                # 控频：避免触发 yfinance 限流
                await asyncio.sleep(REQUEST_DELAY)

            except Exception as e:
                error_count += 1
                logger.error(f"Error syncing {desc} for {symbol}: {e}")

    logger.info(
        f"Kline sync job completed. Success: {success_count}, Errors: {error_count}"
    )


async def sync_single_symbol_klines(symbol: str):
    """
    同步单个标的的K线数据（用于触发式同步）

    Args:
        symbol: 标的代码
    """
    logger.info(f"Syncing klines for single symbol: {symbol}")

    intervals = [("1d", "日线"), ("1w", "周线"), ("1M", "月线")]

    for interval, desc in intervals:
        try:
            if await _should_skip_external_fetch(symbol, interval):
                continue

            result = await data_api.get_kline(symbol=symbol, interval=interval, limit=252)

            kline_data = result.get("data", [])

            if not kline_data:
                logger.warning(f"No {desc} kline data for {symbol}")
                continue

            sync_result = await data_api.sync_kline(symbol, interval, kline_data)

            if sync_result.get("success"):
                logger.info(
                    f"Successfully synced {len(kline_data)} {desc} records for {symbol}"
                )
            else:
                logger.error(
                    f"Failed to sync {desc} for {symbol}: {sync_result.get('error')}"
                )

            # 控频
            await asyncio.sleep(REQUEST_DELAY)

        except Exception as e:
            logger.error(f"Error syncing {desc} for {symbol}: {e}")
