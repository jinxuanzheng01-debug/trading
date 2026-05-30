from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api.routes import router, health_router
from .config import get_settings

settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    version=settings.version,
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)
app.include_router(health_router)


@app.on_event("startup")
async def startup():
    print(f"{settings.app_name} v{settings.version} starting on port {settings.port}...")


@app.on_event("shutdown")
async def shutdown():
    print(f"{settings.app_name} shutting down...")
