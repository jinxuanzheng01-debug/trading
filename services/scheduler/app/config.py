# services/scheduler/app/config.py
from pydantic_settings import BaseSettings
from functools import lru_cache

class Settings(BaseSettings):
    # 服务配置
    app_name: str = "Scheduler Service"
    version: str = "0.1.0"
    host: str = "0.0.0.0"
    port: int = 8001

    # 后端 API (获取自选列表)
    backend_api_url: str = "http://localhost:3002"

    # 数据服务 API
    data_api_url: str = "http://localhost:8000"

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # Stream 配置
    watchlist_stream: str = "watchlist:events"
    consumer_group: str = "scheduler"
    consumer_name: str = "scheduler-1"

    # 日志
    log_level: str = "INFO"
    log_dir: str = "/var/log/trading-agent"

    class Config:
        env_file = ".env"

@lru_cache()
def get_settings() -> Settings:
    return Settings()
