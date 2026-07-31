from fastapi import APIRouter

# anything you hang off api_router inherits /api/v1 for free
api_router = APIRouter(prefix="/api/v1")
