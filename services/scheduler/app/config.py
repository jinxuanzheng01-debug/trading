# services/scheduler/app/config.py
from pydantic_settings import BaseSettings
from functools import lru_cache

class Settings(BaseSettings):
    # 服务配置
    app_name: str = "Scheduler Service"
    version: str = "0.1.0"
    host: str = "0.0.0.0"
    port: int = 8001

    # 后端 API
    backend_api_url: str = "http://api:4000"

    # 数据服务 API
    data_api_url: str = "http://market-data:8000"

    # 内部服务 token
    service_token: str = "trading-agent-internal-token"

    # 日志
    log_level: str = "INFO"
    log_dir: str = "/var/log/trading-agent"

    class Config:
        env_file = ".env"

@lru_cache()
def get_settings() -> Settings:
    return Settings()
