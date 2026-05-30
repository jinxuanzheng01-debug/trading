"""
K线数据同步任务

从数据服务获取所有股票的K线数据，写入时序数据库
"""
import asyncio
import logging
from datetime import datetime, timedelta

from ..clients.backend_api import backend_api
from ..clients.data_api import data_api

logger = logging.getLogger(__name__)

# 控频：每次请求间隔（秒），yfinance 免费 API 限制较严格
REQUEST_DELAY = 2.0


async def _get_latest_kline_date(symbol: str, interval: str) -> str | None:
    """获取本地最新K线日期的下一天，返回 'YYYY-MM-DD' 格式或 None（无数据时）"""
    try:
        result = await backend_api.get_latest_kline(symbol, interval)
        latest = result.get("latest_at")
        if not latest:
            return None

        latest_dt = datetime.fromisoformat(latest.replace("Z", "+00:00"))
        next_day = latest_dt.date() + timedelta(days=1)
        return next_day.isoformat()
    except Exception as e:
        logger.warning(f"Failed to check latest kline for {symbol}/{interval}: {e}")
        return None


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

    success_count = 0
    error_count = 0

    for symbol in symbols:
        try:
            latest_date = await _get_latest_kline_date(symbol, "1d")

            if latest_date:
                logger.info(f"Incremental sync for {symbol} from {latest_date}...")
                result = await data_api.get_kline(
                    symbol=symbol, interval="1d", limit=100,
                    start=latest_date,
                )
            else:
                logger.info(f"Full sync kline for {symbol} (no local data)...")
                result = await data_api.get_kline(
                    symbol=symbol, interval="1d",
                    start="1990-01-01",
                )

            kline_data = result.get("data", [])

            if not kline_data:
                logger.warning(f"No kline data for {symbol}")
                continue

            sync_result = await backend_api.sync_kline(symbol, "1d", kline_data)

            if sync_result.get("success"):
                success_count += 1
                logger.info(
                    f"Successfully synced {len(kline_data)} records for {symbol}"
                )
            else:
                error_count += 1
                logger.error(
                    f"Failed to sync for {symbol}: {sync_result.get('error')}"
                )

            await asyncio.sleep(REQUEST_DELAY)

        except Exception as e:
            error_count += 1
            logger.error(f"Error syncing for {symbol}: {e}")

    logger.info(
        f"Kline sync job completed. Success: {success_count}, Errors: {error_count}"
    )


async def seed_if_empty():
    """
    启动时检测：如果 klines 表为空，自动跑全量同步。
    从 stocks 表获取所有代码，批量拉取全量日线（从 1990-01-01 起）写入 PG。
    """
    try:
        import httpx

        # 检查 klines 是否为空
        latest_info = await backend_api.get_latest_kline("AAPL", "1d")
        if latest_info.get("latest_at"):
            logger.info("klines 表已有数据，跳过全量 seed")
            return

        logger.info("klines 表为空，开始全量同步...")

        symbols = await backend_api.get_all_stock_symbols()
        if not symbols:
            logger.warning("stocks 表为空，跳过 seed")
            return

        logger.info(f"共 {len(symbols)} 只股票，开始全量拉取日线...")

        batch_size = 50
        success = 0
        failed = 0

        async with httpx.AsyncClient(timeout=120.0) as client:
            for i in range(0, len(symbols), batch_size):
                batch = symbols[i : i + batch_size]
                symbols_str = ",".join(batch)

                try:
                    resp = await client.get(
                        f"{data_api.base_url}/api/kline/batch",
                        params={
                            "symbols": symbols_str,
                            "interval": "1d",
                            "start": "1990-01-01",
                        },
                    )
                    data_map = resp.json().get("data", {}) if resp.status_code == 200 else {}
                except Exception as e:
                    logger.error(f"批次 {i//batch_size+1} 拉取失败: {e}")
                    failed += len(batch)
                    continue

                for sym in batch:
                    klines = data_map.get(sym, [])
                    if not klines:
                        failed += 1
                        continue
                    try:
                        await backend_api.sync_kline(sym, "1d", [
                            {"time": k["time"], "open": k["open"], "high": k["high"],
                             "low": k["low"], "close": k["close"], "volume": k["volume"]}
                            for k in klines
                        ])
                        success += 1
                    except Exception:
                        failed += 1

                await asyncio.sleep(1)

        logger.info(f"全量 seed 完成: {success} 成功, {failed} 失败")

    except Exception as e:
        logger.error(f"seed_if_empty 失败: {e}")


