"""
定时同步股票基本面数据

收盘后同步 PE、EPS、市值等基本面指标
- US (美股): 05:00 北京时间 (美股收盘后约30分钟)
"""
import logging
from typing import List

from ..clients.backend_api import backend_api

logger = logging.getLogger(__name__)


async def sync_fundamentals():
    """
    同步所有股票的基本面数据（PE、EPS、市值等）

    流程:
    1. 从后端 API 获取 stocks 表中所有股票代码
    2. 分批调用 market-data 获取最新基本面
    3. 通过后端 API 写入 stock_fundamentals 表
    """
    logger.info("Starting fundamentals sync job...")

    symbols = await backend_api.get_all_stock_symbols()

    if not symbols:
        logger.warning("No symbols found, skipping fundamentals sync")
        return

    logger.info(f"Found {len(symbols)} symbols to sync fundamentals")

    success_count = 0
    error_count = 0

    # 分批处理，每批 5 个（基本面数据较重）
    batch_size = 5
    for i in range(0, len(symbols), batch_size):
        batch = symbols[i:i + batch_size]

        try:
            logger.info(f"Syncing fundamentals for batch {i//batch_size + 1}: {batch}")

            result = await backend_api.sync_fundamentals(batch)
            results = result.get("results", {})

            for sym, r in results.items():
                if r.get("success"):
                    success_count += 1
                else:
                    error_count += 1
                    logger.error(f"Failed to sync fundamentals for {sym}: {r.get('error')}")

        except Exception as e:
            error_count += len(batch)
            logger.error(f"Error syncing fundamentals for batch {i//batch_size + 1} ({batch}): {e}")

    logger.info(
        f"Fundamentals sync job completed. Success: {success_count}, Errors: {error_count}"
    )


async def sync_us_fundamentals():
    """同步美股基本面 - 每天 05:00 北京时间"""
    logger.info("Starting US fundamentals sync at 05:00 Beijing time")
    await sync_fundamentals()
