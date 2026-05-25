"""
K线数据同步任务

从数据服务获取自选标的的K线数据，并存储到时序数据库
"""
import logging
from typing import List
from datetime import datetime

from ..clients.backend_api import backend_api
from ..clients.data_api import data_api

logger = logging.getLogger(__name__)


async def sync_watchlist_klines():
    """
    同步所有自选标的的K线数据

    流程:
    1. 从后端 API 获取所有用户的自选标的列表
    2. 对每个标的，从数据服务获取最新K线数据
    3. 将K线数据通过数据服务写入 TimescaleDB
    """
    logger.info("Starting kline sync job...")

    # 获取所有自选标的
    symbols = await backend_api.get_watchlist_symbols()

    if not symbols:
        logger.warning("No symbols found in watchlist, skipping sync")
        return

    logger.info(f"Found {len(symbols)} symbols to sync: {symbols}")

    # K线周期配置: [周期代码, 描述]
    intervals = [
        ("1d", "日线"),
        ("1w", "周线"),
        ("1m", "月线"),
    ]

    success_count = 0
    error_count = 0

    for symbol in symbols:
        for interval, desc in intervals:
            try:
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

    intervals = [("1d", "日线"), ("1w", "周线"), ("1m", "月线")]

    for interval, desc in intervals:
        try:
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

        except Exception as e:
            logger.error(f"Error syncing {desc} for {symbol}: {e}")
