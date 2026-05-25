import asyncio
from sqlalchemy import text
from .connection import engine
from .models import Base

async def init_database():
    """初始化数据库表"""
    async with engine.begin() as conn:
        # 创建超表
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS ohlcv (
                time TIMESTAMPTZ NOT NULL,
                symbol VARCHAR(50) NOT NULL,
                interval VARCHAR(10) NOT NULL,
                open DECIMAL(20, 8) NOT NULL,
                high DECIMAL(20, 8) NOT NULL,
                low DECIMAL(20, 8) NOT NULL,
                close DECIMAL(20, 8) NOT NULL,
                volume BIGINT NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                PRIMARY KEY (time, symbol, interval)
            );
        """))

        # 转换为超表
        await conn.execute(text("""
            SELECT create_hypertable('ohlcv', 'time', if_not_exists => TRUE);
        """))

        # 创建索引
        await conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_ohlcv_symbol_time ON ohlcv(symbol, time DESC);
        """))
        await conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_ohlcv_symbol_interval ON ohlcv(symbol, interval, time DESC);
        """))

        # 创建同步日志表
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS sync_log (
                id SERIAL PRIMARY KEY,
                symbol VARCHAR(50) NOT NULL,
                interval VARCHAR(10) NOT NULL,
                start_date DATE NOT NULL,
                end_date DATE NOT NULL,
                records_count INT NOT NULL,
                status VARCHAR(20) NOT NULL,
                error_message TEXT,
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
        """))

        await conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_sync_log_symbol_created ON sync_log(symbol, created_at DESC);
        """))

    print("Database initialized successfully")

if __name__ == "__main__":
    asyncio.run(init_database())
