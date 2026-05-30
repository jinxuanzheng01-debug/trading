# services/scheduler/app/main.py
import logging
from fastapi import FastAPI
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from app.config import get_settings
from app.jobs.sync_kline import sync_all_stock_klines, seed_if_empty
from app.jobs.sync_stock_quotes import sync_cn_quotes, sync_hk_quotes, sync_us_quotes
from app.jobs.sync_fundamentals import sync_us_fundamentals

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


@app.on_event("startup")
async def startup():
    # 启动 K线同步定时任务（每天早上 6 点，美股已收盘）
    scheduler.add_job(
        sync_all_stock_klines,
        'cron',
        hour=6,
        minute=0,
        id='sync_all_stock_klines'
    )

    # 启动时检测：klines 表为空则跑全量 seed
    await seed_if_empty()

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

    # 基本面数据同步（PE、EPS、市值等）- 美股收盘后
    scheduler.add_job(
        sync_us_fundamentals,
        'cron',
        hour=5,
        minute=0,
        id='sync_us_fundamentals'
    )

    scheduler.start()

    logger.info(f"{settings.app_name} v{settings.version} started with scheduler")


@app.on_event("shutdown")
async def shutdown():
    scheduler.shutdown()
    logger.info(f"{settings.app_name} shutting down...")


@app.get("/health")
async def health():
    return {"status": "ok", "scheduler": "running"}
