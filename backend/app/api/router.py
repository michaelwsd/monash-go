from fastapi import APIRouter

from app.api.routes import bookings, compare, pet, rewards, rides, users, vehicles

# anything you hang off api_router inherits /api/v1 for free
api_router = APIRouter(prefix="/api/v1")
api_router.include_router(users.router)
api_router.include_router(vehicles.router)
api_router.include_router(rides.router)
api_router.include_router(bookings.router)
api_router.include_router(compare.router)
api_router.include_router(rewards.router)
api_router.include_router(pet.router)
