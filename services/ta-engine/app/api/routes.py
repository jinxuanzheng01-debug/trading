from fastapi import APIRouter
from datetime import datetime

router = APIRouter(prefix="/api")
health_router = APIRouter()


@health_router.get("/health")
async def health_check():
    return {"status": "ok", "timestamp": datetime.utcnow().isoformat()}
