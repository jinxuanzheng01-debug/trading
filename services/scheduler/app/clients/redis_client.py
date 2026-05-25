"""
Redis client for scheduler service

用于消费 Backend 发布的 watchlist 事件流
"""
import redis.asyncio as aioredis
from typing import Optional
from app.config import get_settings

settings = get_settings()

# Global Redis client
redis_client: Optional[aioredis.Redis] = None


async def get_redis() -> aioredis.Redis:
    """
    获取 Redis 客户端（单例模式）
    """
    global redis_client

    if redis_client is None:
        redis_client = aioredis.from_url(
            settings.redis_url,
            encoding="utf-8",
            decode_responses=True,
        )

    return redis_client


async def close_redis():
    """
    关闭 Redis 连接
    """
    global redis_client

    if redis_client:
        await redis_client.close()
        redis_client = None


async def create_consumer_group():
    """
    创建消费者组（如果不存在）

    Stream: watchlist:events
    Group: scheduler
    """
    redis = await get_redis()

    try:
        # 创建消费者组，从头开始读取
        await redis.xgroup_create(
            settings.watchlist_stream,
            settings.consumer_group,
            id="0",
            mkstream=True  # 如果 stream 不存在则创建
        )
        print(f"Created consumer group '{settings.consumer_group}' for stream '{settings.watchlist_stream}'")
    except aioredis.ResponseError as e:
        if "BUSYGROUP" in str(e):
            print(f"Consumer group '{settings.consumer_group}' already exists")
        else:
            raise


async def read_events(count: int = 1, block: int = 5000):
    """
    从 Stream 中读取事件

    Args:
        count: 每次读取最多多少条消息
        block: 阻塞等待时间（毫秒）

    Returns:
        List of (stream_name, messages) tuples
        messages: List of (message_id, data) tuples
    """
    redis = await get_redis()

    try:
        # 使用 XREADGROUP 读取新消息
        # ">" 表示只读取尚未传递给其他消费者的消息
        events = await redis.xreadgroup(
            settings.consumer_group,
            settings.consumer_name,
            {settings.watchlist_stream: ">"},
            count=count,
            block=block
        )
        return events or []
    except aioredis.ResponseError as e:
        if "NOGROUP" in str(e):
            # 消费者组不存在，尝试创建
            await create_consumer_group()
            return []
        raise


async def ack_message(message_id: str):
    """
    确认消息已处理

    Args:
        message_id: 消息 ID
    """
    redis = await get_redis()
    await redis.xack(settings.watchlist_stream, settings.consumer_group, message_id)
