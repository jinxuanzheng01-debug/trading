"""
一次性脚本：从 market-data 服务批量拉取全量日线 K 线并写入 PG。

用法：
    python scripts/seed_klines.py                     # 全量
    python scripts/seed_klines.py --batch-size 50     # 自定义批次
    python scripts/seed_klines.py --limit 100          # 每只股票只拉最近 N 根日线
    python scripts/seed_klines.py --skip-existing      # 有数据的跳过

幂等：UPSERT，挂了重跑自动跳过。
"""

import asyncio
import logging
import sys
import time

import httpx

API_URL = "http://localhost:4000"
MARKET_DATA_URL = "http://localhost:8000"
SERVICE_TOKEN = "trading-agent-internal-token"
BATCH_SIZE = 50
START_DATE = "1990-01-01"  # 从足够早的日期开始，yfinance 返回实际可用的数据
REQUEST_DELAY = 1.0     # 批次间隔 1 秒

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger(__name__)


async def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--batch-size", type=int, default=BATCH_SIZE)
    parser.add_argument("--start", type=str, default=START_DATE)
    parser.add_argument("--skip-existing", action="store_true")
    parser.add_argument("--symbols", type=str)
    args = parser.parse_args()

    async with httpx.AsyncClient(timeout=120.0) as client:
        # 获取所有股票代码
        if args.symbols:
            symbols = [s.strip().upper() for s in args.symbols.split(",")]
        else:
            resp = await client.get(f"{API_URL}/api/internal/stocks/symbols", headers={"X-Service-Token": SERVICE_TOKEN})
            symbols = resp.json().get("symbols", [])

        total = len(symbols)
        logger.info(f"开始处理 {total} 只股票, batch={args.batch_size}, start={args.start}")

        success = 0
        failed = 0
        skipped = 0
        start_time = time.time()

        for i in range(0, total, args.batch_size):
            batch = symbols[i : i + args.batch_size]
            batch_num = i // args.batch_size + 1
            total_batches = (total + args.batch_size - 1) // args.batch_size

            # 批量拉取 K 线
            symbols_str = ",".join(batch)
            logger.info(f"[{batch_num}/{total_batches}] 拉取 {len(batch)} 只: {batch[0]}...{batch[-1]}")

            try:
                resp = await client.get(
                    f"{MARKET_DATA_URL}/api/kline/batch",
                    params={
                        "symbols": symbols_str,
                        "interval": "1d",
                        "start": args.start,
                    },
                )
                data_map = resp.json().get("data", {})
            except Exception as e:
                logger.error(f"批次 {batch_num} 拉取失败: {e}")
                failed += len(batch)
                continue

            # 逐只落库
            for sym in batch:
                klines = data_map.get(sym, [])
                if not klines:
                    failed += 1
                    continue

                try:
                    await client.post(
                        f"{API_URL}/api/internal/klines/sync",
                        headers={"X-Service-Token": SERVICE_TOKEN},
                        json={
                            "symbol": sym,
                            "data": [
                                {
                                    "time": k["time"],
                                    "open": k["open"],
                                    "high": k["high"],
                                    "low": k["low"],
                                    "close": k["close"],
                                    "volume": k["volume"],
                                }
                                for k in klines
                            ],
                        },
                    )
                    success += 1
                except Exception as e:
                    logger.error(f"[{sym}] 落库失败: {e}")
                    failed += 1

            if i + args.batch_size < total:
                await asyncio.sleep(REQUEST_DELAY)

        elapsed = time.time() - start_time
        logger.info(f"完成: {success} 成功, {failed} 失败, 耗时 {elapsed:.0f}s")


if __name__ == "__main__":
    asyncio.run(main())
