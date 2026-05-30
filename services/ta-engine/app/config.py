from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    app_name: str = "TA Engine"
    version: str = "0.1.0"
    host: str = "0.0.0.0"
    port: int = 8003

    # market-data 服务地址
    market_data_url: str = "http://market-data:8000"

    # 服务间认证 token
    service_token: str = "trading-agent-internal-token"

    class Config:
        env_file = ".env"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
