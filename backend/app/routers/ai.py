"""Stage 2 — AI Recommendation Engine"""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
import json, asyncio, time
from app.database import get_db
from app.models.workflow import IntakeForm, AIRecommendation
from app.services.ai_engine import AIEngine
from app.routers.intake import _expire_unlock_if_needed

router = APIRouter()

class RecommendRequest(BaseModel):
    intake_id: str
    stream: bool = True

@router.post("/ai/recommend")
async def generate_recommendation(payload: RecommendRequest, db: AsyncSession = Depends(get_db)):
    """
    Stage 2: Call LLM (Azure OpenAI or AWS Bedrock) with intake JSON.
    Returns structured infrastructure recommendation across 7 categories.
    NFR: response < 10 seconds.
    Requires Provider Admin unlock JWT to have been verified by Tenant User (or still in-flight consumed).
    """
    form = await db.get(IntakeForm, payload.intake_id)
    if not form:
        raise HTTPException(status_code=404, detail="Intake form not found")

    if _expire_unlock_if_needed(form):
        await db.flush()
        raise HTTPException(
            status_code=400,
            detail=(
                "Unlock JWT token expired (5 minutes). "
                "Tenant Admin and Provider Admin level approval are required again "
                "before AI recommendation."
            ),
        )

    if form.status not in ("queued_for_recommendation", "recommendation_ready"):
        raise HTTPException(
            status_code=400,
            detail=(
                f"Intake status is '{form.status}'. "
                "Tenant Admin and Provider Admin must approve the Project Intake "
                "before AI recommendation, cost estimation, and Terraform generation."
            ),
        )

    if not form.unlock_token_consumed_at:
        raise HTTPException(
            status_code=400,
            detail=(
                "Unlock JWT has not been verified yet. "
                "Enter the 16-character alphanumeric token from Tenant User notifications to Run AI Recommendation Engine."
            ),
        )

    engine = AIEngine(cloud=form.cloud)

    if payload.stream:
        async def event_stream():
            t0 = time.time()
            async for chunk in engine.stream_recommendation(form):
                yield f"data: {json.dumps({'chunk': chunk})}\n\n"
            yield f"data: {json.dumps({'done': True, 'latency_ms': int((time.time()-t0)*1000)})}\n\n"
        return StreamingResponse(event_stream(), media_type="text/event-stream")

    t0 = time.time()
    rec_data = await engine.generate_recommendation(form)
    latency_ms = int((time.time() - t0) * 1000)

    rec = AIRecommendation(
        intake_id=form.id, tenant_id=form.tenant_id,
        summary=rec_data["summary"], resources=rec_data["resources"],
        compliance_notes=rec_data.get("compliance_notes", ""),
        opa_flags=rec_data.get("opa_flags", []),
        total_monthly_cost=sum(r.get("monthly_cost", 0) for r in rec_data["resources"]),
        model_used=engine.model_name, latency_ms=latency_ms,
    )
    db.add(rec)
    await db.commit()
    await db.refresh(rec)
    return {**rec_data, "recommendationId": rec.id, "latencyMs": latency_ms,
            "totalMonthlyCost": rec.total_monthly_cost}
