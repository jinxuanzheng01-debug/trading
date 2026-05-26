from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.encoders import jsonable_encoder
from datetime import datetime
from .api.routes import router, health_router
from .config import get_settings
from .services.cache import cache

settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    version=settings.version,
    docs_url="/docs",
    redoc_url="/redoc"
)

# TODO: Configure CORS origins via settings for production
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Development only
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)
app.include_router(health_router)


# TODO: Migrate to lifespan context manager (FastAPI 0.93+)
@app.on_event("startup")
async def startup():
    await cache.connect()
    print(f"{settings.app_name} v{settings.version} starting...")


@app.on_event("shutdown")
async def shutdown():
    await cache.close()
    print(f"{settings.app_name} shutting down...")
