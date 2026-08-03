"""Stage router: audit"""
from fastapi import APIRouter
router = APIRouter()

@router.get("/audit/ping")
async def ping():
    return {"stage": "audit", "status": "ok"}
