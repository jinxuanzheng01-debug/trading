"""
定时同步股票报价任务

在市场收盘后自动同步自选标的的实时报价
- CN (A股): 15:35 北京时间
- HK (港股): 16:35 北京时间
- US (美股): 04:35 北京时间 (次日)
"""
import logging
from typing import List, Dict, Any
from datetime import datetime

from ..clients.backend_api import backend_api
from ..clients.data_api import data_api

logger = logging.getLogger(__name__)


async def sync_stock_quotes():
    """
    同步所有自选标的的实时报价

    流程:
    1. 从后端 API 获取所有用户的自选标的列表
    2. 对每个标的，从数据服务获取实时报价
    3. 通过后端 API 更新缓存中的报价数据
    """
    logger.info("Starting stock quotes sync job...")

    # 获取所有自选标的
    symbols = await backend_api.get_watchlist_symbols()

    if not symbols:
        logger.warning("No symbols found in watchlist, skipping quotes sync")
        return

    logger.info(f"Found {len(symbols)} symbols to sync quotes: {symbols}")

    success_count = 0
    error_count = 0

    # 分批处理，每批最多20个标的
    batch_size = 20
    for i in range(0, len(symbols), batch_size):
        batch = symbols[i:i + batch_size]

        try:
            logger.info(f"Syncing quotes for batch {i//batch_size + 1}: {batch}")

            # 从数据服务获取报价
            quotes = await data_api.get_quotes(batch)

            if not quotes:
                logger.warning(f"No quotes data for batch {batch}")
                # 继续处理，但统计为错误
                error_count += len(batch)
                continue

            # 更新后端缓存
            update_result = await backend_api.update_quotes_cache(quotes)

            if update_result.get("success"):
                success_count += len(quotes)
                logger.info(
                    f"Successfully updated quotes for {len(quotes)} symbols in batch {i//batch_size + 1}"
                )
            else:
                error_count += len(batch)
                logger.error(
                    f"Failed to update quotes cache for batch {i//batch_size + 1}: {update_result.get('error')}"
                )

        except Exception as e:
            error_count += len(batch)
            logger.error(f"Error syncing quotes for batch {i//batch_size + 1} ({batch}): {e}")

    logger.info(
        f"Stock quotes sync job completed. Success: {success_count}, Errors: {error_count}"
    )


async def sync_cn_quotes():
    """同步A股报价 - 每天 15:35 北京时间"""
    logger.info("Starting CN (A-share) quotes sync at 15:35 Beijing time")
    await sync_stock_quotes()


async def sync_hk_quotes():
    """同步港股报价 - 每天 16:35 北京时间"""
    logger.info("Starting HK quotes sync at 16:35 Beijing time")
    await sync_stock_quotes()


async def sync_us_quotes():
    """同步美股报价 - 每天 04:35 北京时间 (次日)"""
    logger.info("Starting US quotes sync at 04:35 Beijing time (next day)")
    await sync_stock_quotes()
