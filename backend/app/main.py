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
    allow_origins=settings.cors_origins, # can't use Depends as it doesn't invoke the function
    # Clerk sends its JWT in the Authorization header, not a cookie
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)

# app includes api_router → api_router includes users.router, so api under users becomes /api/v1/users/...
app.include_router(api_router)


# registered on app, not api_router as health does not move with the API version
@app.get("/health")
async def health(settings: SettingsDep) -> HealthResponse:
    return HealthResponse(status="ok", environment=settings.environment)
