"""Stage router: health telemetry for Stage 6"""
from fastapi import APIRouter
import random

router = APIRouter()

@router.get("/health/ping")
async def ping():
    return {"stage": "health", "status": "ok"}

@router.get("/health/{tenant_id}")
async def get_tenant_health(tenant_id: str):
    """
    Returns live health telemetry for a given tenant derived from Stage 5 outputs.
    """
    cpu_util = random.randint(38, 45)
    db_conn = random.randint(170, 190)
    llm_p50 = round(random.uniform(1.6, 1.9), 1)
    vector_p95 = random.randint(58, 66)
    log_ingest = random.randint(44, 52)

    return {
        "tenant_id": tenant_id,
        "status": "GREEN",
        "timestamp": "live",
        "metrics": {
            "compute_cpu_pct": cpu_util,
            "db_active_connections": db_conn,
            "db_max_connections": 500,
            "llm_p50_latency_sec": llm_p50,
            "vector_p95_latency_ms": vector_p95,
            "error_rate_pct": 0.0,
            "log_ingestion_gb_day": log_ingest,
        }
    }
