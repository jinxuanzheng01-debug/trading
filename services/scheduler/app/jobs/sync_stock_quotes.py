"""
定时同步股票报价任务

在市场收盘后自动同步对应市场的报价
- CN (A股): 15:35 北京时间
- HK (港股): 16:35 北京时间
- US (美股): 04:35 北京时间 (次日)
"""
import logging
from typing import Dict, Callable

from ..clients.backend_api import backend_api, is_a_stock, is_hk_stock, is_us_stock
from ..clients.data_api import data_api

logger = logging.getLogger(__name__)

# 市场过滤函数
MARKET_FILTERS: Dict[str, Callable[[str], bool]] = {
    "CN": is_a_stock,
    "HK": is_hk_stock,
    "US": is_us_stock,
}


async def sync_stock_quotes(market: str | None = None):
    """
    同步股票报价

    Args:
        market: CN/HK/US，None 表示全量同步
    """
    market_label = market or "ALL"
    logger.info(f"Starting stock quotes sync job for market: {market_label}")

    symbols = await backend_api.get_all_stock_symbols()

    if not symbols:
        logger.warning("No symbols found, skipping quotes sync")
        return

    # 按市场过滤
    if market and market in MARKET_FILTERS:
        filter_fn = MARKET_FILTERS[market]
        symbols = [s for s in symbols if filter_fn(s)]

    if not symbols:
        logger.info(f"No symbols for market {market_label}, skipping")
        return

    logger.info(f"Syncing quotes for {len(symbols)} symbols")

    success_count = 0
    error_count = 0

    batch_size = 20
    for i in range(0, len(symbols), batch_size):
        batch = symbols[i:i + batch_size]

        try:
            logger.info(f"Syncing quotes for batch {i//batch_size + 1}: {batch}")

            quotes = await data_api.get_quotes(batch)

            if not quotes:
                logger.warning(f"No quotes data for batch {batch}")
                error_count += len(batch)
                continue

            update_result = await backend_api.sync_quotes(quotes)

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
    await sync_stock_quotes("CN")


async def sync_hk_quotes():
    """同步港股报价 - 每天 16:35 北京时间"""
    logger.info("Starting HK quotes sync at 16:35 Beijing time")
    await sync_stock_quotes("HK")


async def sync_us_quotes():
    """同步美股报价 - 每天 04:35 北京时间 (次日)"""
    logger.info("Starting US quotes sync at 04:35 Beijing time (next day)")
    await sync_stock_quotes("US")
