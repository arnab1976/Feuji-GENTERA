"""Stage 3 — Cost Estimation & Review"""
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import List
from app.database import get_db
from app.models.workflow import AIRecommendation, ResourcePlan, IntakeForm
from app.models.tenant import Tenant
from app.services.activity_service import log_activity

router = APIRouter()


class ResourceEdit(BaseModel):
    category: str
    resource: str
    monthly_cost: int


class CostApprovalRequest(BaseModel):
    recommendation_id: str
    tenant_id: str
    resources: List[ResourceEdit]
    approved_by: str = "tenant_admin"


@router.post("/cost/approve")
async def approve_cost_plan(payload: CostApprovalRequest, db: AsyncSession = Depends(get_db)):
    """
    Stage 3: User reviews and edits resource costs, then approves the plan.
    If total > budget_ceiling, escalation is logged for Provider Admin.
    """
    rec = await db.get(AIRecommendation, payload.recommendation_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Recommendation not found")

    resources = [r.model_dump() for r in payload.resources]
    approved_total = sum(r["monthly_cost"] for r in resources)

    form = await db.get(IntakeForm, rec.intake_id)
    budget = form.budget_ceiling if form else 2000
    requires_approval = approved_total > budget

    plan = ResourcePlan(
        tenant_id=payload.tenant_id,
        recommendation_id=payload.recommendation_id,
        resources=resources,
        approved_total=approved_total,
        budget_ceiling=budget,
        requires_approval=requires_approval,
        approved_by=payload.approved_by if not requires_approval else None,
        approved_at=datetime.utcnow() if not requires_approval else None,
    )
    db.add(plan)
    await db.flush()

    tenant = await db.get(Tenant, payload.tenant_id)
    org = tenant.org_name if tenant else payload.tenant_id

    if requires_approval:
        await log_activity(
            db,
            kind="escalation",
            from_role="Tenant Admin",
            to_role="Provider Admin",
            from_name=payload.approved_by or "Tenant Admin",
            to_name="Provider Admin",
            message="Budget escalation",
            detail=f"{org} tenant at ${approved_total:,} vs ${budget:,} ceiling",
            tenant_id=payload.tenant_id,
            unread=True,
        )
    else:
        await log_activity(
            db,
            kind="approval",
            from_role="Tenant Admin",
            to_role="Tenant User",
            from_name=payload.approved_by or "Tenant Admin",
            to_name="Tenant User",
            message="Cost plan approved",
            detail=f"{org} · ${approved_total:,} within ${budget:,} ceiling",
            tenant_id=payload.tenant_id,
            unread=True,
        )

    await db.commit()
    await db.refresh(plan)

    return {
        "planId": plan.id, "approvedTotal": approved_total,
        "budgetCeiling": budget, "requiresApproval": requires_approval,
        "status": "approved" if not requires_approval else "pending_tenant_admin_approval",
    }
