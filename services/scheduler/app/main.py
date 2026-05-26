# services/scheduler/app/main.py
import asyncio
import logging
from fastapi import FastAPI
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from app.config import get_settings
from app.jobs.sync_kline import sync_all_stock_klines, sync_single_symbol_klines
from app.jobs.sync_stock_quotes import sync_cn_quotes, sync_hk_quotes, sync_us_quotes
from app.clients.redis_client import create_consumer_group, read_events, ack_message, close_redis

settings = get_settings()

# 配置日志
logging.basicConfig(
    level=getattr(logging, settings.log_level),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title=settings.app_name,
    version=settings.version,
    docs_url="/docs",
    redoc_url="/redoc"
)

scheduler = AsyncIOScheduler()


async def consume_watchlist_events():
    """
    持续消费 watchlist 事件流
    """
    logger.info("Starting watchlist events consumer...")

    while True:
        try:
            events = await read_events(count=1, block=5000)

            for stream_name, messages in events:
                for message_id, data in messages:
                    try:
                        event_type = data.get("type")
                        symbol = data.get("symbol")

                        if event_type == "added" and symbol:
                            logger.info(f"Received 'added' event for symbol: {symbol}")
                            # 异步触发单个标的的 K线同步
                            await sync_single_symbol_klines(symbol)
                        elif event_type == "removed":
                            logger.info(f"Received 'removed' event")
                            # 可选：清理相关缓存或数据
                        else:
                            logger.warning(f"Unknown event type: {event_type}")

                        # 确认消息已处理
                        await ack_message(message_id)
                        logger.debug(f"Acked message {message_id}")

                    except Exception as e:
                        logger.error(f"Error processing message {message_id}: {e}")

        except Exception as e:
            logger.error(f"Error in event consumer loop: {e}")
            # 等待后重试
            await asyncio.sleep(5)


@app.on_event("startup")
async def startup():
    # 创建 Redis Stream 消费者组
    await create_consumer_group()

    # 启动 K线同步定时任务（每天早上 6 点，美股已收盘）
    scheduler.add_job(
        sync_all_stock_klines,
        'cron',
        hour=6,
        minute=0,
        id='sync_all_stock_klines'
    )

    # 启动报价同步定时任务
    # CN (A股): 15:35 北京时间
    scheduler.add_job(
        sync_cn_quotes,
        'cron',
        hour=15,
        minute=35,
        id='sync_cn_quotes'
    )

    # HK (港股): 16:35 北京时间
    scheduler.add_job(
        sync_hk_quotes,
        'cron',
        hour=16,
        minute=35,
        id='sync_hk_quotes'
    )

    # US (美股): 04:35 北京时间 (次日)
    scheduler.add_job(
        sync_us_quotes,
        'cron',
        hour=4,
        minute=35,
        id='sync_us_quotes'
    )

    scheduler.start()

    # 启动事件消费任务
    asyncio.create_task(consume_watchlist_events())

    logger.info(f"{settings.app_name} v{settings.version} started with scheduler and event consumer")


@app.on_event("shutdown")
async def shutdown():
    scheduler.shutdown()
    await close_redis()
    logger.info(f"{settings.app_name} shutting down...")


@app.get("/health")
async def health():
    return {"status": "ok", "scheduler": "running", "event_consumer": "running"}


# Webhook 接口（保留用于向后兼容，已废弃）
@app.post("/webhook/watchlist/added")
async def on_watchlist_added(data: dict):
    """
    新增自选时触发（已废弃，请使用 Redis Streams）

    该接口保留用于向后兼容，但建议通过事件流触发
    """
    symbol = data.get("symbol")
    if symbol:
        # 直接触发同步
        await sync_single_symbol_klines(symbol)
        return {"status": "scheduled", "symbol": symbol}
    return {"status": "error", "message": "symbol required"}
