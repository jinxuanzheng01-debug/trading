from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # 服务配置
    app_name: str = "Market Data Service"
    version: str = "0.1.0"
    host: str = "0.0.0.0"
    port: int = 8000

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # PostgreSQL
    database_url: str = "postgresql://admin:admin123@localhost:5432/trading_agent"

    # 数据源配置
    yfinance_timeout: int = 10
    yfinance_max_retries: int = 3
    akshare_timeout: int = 10
    akshare_max_retries: int = 3

    # 日志
    log_level: str = "INFO"
    log_dir: str = "/var/log/trading-agent"

    class Config:
        env_file = ".env"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
