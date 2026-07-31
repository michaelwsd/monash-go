from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.deps import SettingsDep
from app.api.router import api_router
from app.core.config import get_settings
from app.models.health import HealthResponse

settings = get_settings()

app = FastAPI(
    title="MonashGO API",
    version="0.1.0",
    # Swagger and ReDoc document every endpoint; keep them off the public deployment
    docs_url=None if settings.environment == "production" else "/docs",
    redoc_url=None if settings.environment == "production" else "/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    # Clerk sends its JWT in the Authorization header, not a cookie
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(api_router)


# Registered on app, not api_router: health is infrastructure and must not move with the API version
@app.get("/health")
async def health(settings: SettingsDep) -> HealthResponse:
    return HealthResponse(status="ok", environment=settings.environment)
