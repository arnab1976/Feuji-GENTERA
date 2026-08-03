"""
Phase 2 — OPTIMA-AI FinOps API
All endpoints derive data from Phase 1 deployment outputs.
Prefix: /api/v2/optima
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from datetime import datetime
from typing import Optional
from app.database import get_db
from app.models.workflow import ResourcePlan, DeploymentOutput, IntakeForm, AIRecommendation
from app.models.optima import OptimizationRecommendation, ApprovalRecord, SavingsRecord
from app.services.optima_engine import OptimaEngine

router = APIRouter()


@router.get("/overview/{tenant_id}")
async def get_finops_overview(tenant_id: str, db: AsyncSession = Depends(get_db)):
    """
    Phase 2 Screen 1: FinOps Overview.
    Derives context entirely from Phase 1 state:
    - Tenant details
    - Latest approved ResourcePlan (Stage 3) → baseline cost
    - Latest DeploymentOutput (Stage 5) → resource identifiers
    - Returns optimization opportunity across 7 levers
    """
    # Get latest resource plan from Phase 1
    plan_stmt = select(ResourcePlan)\
        .where(ResourcePlan.tenant_id == tenant_id)\
        .order_by(ResourcePlan.created_at.desc())
    plan_result = await db.execute(plan_stmt)
    plan = plan_result.scalars().first()

    if not plan:
        raise HTTPException(
            status_code=424,
            detail="No approved resource plan found. Complete Stage 3 (Cost & Review) in Phase 1 first."
        )

    # Get deployment outputs from Phase 1 Stage 5
    output_stmt = select(DeploymentOutput)\
        .where(DeploymentOutput.tenant_id == tenant_id)\
        .order_by(DeploymentOutput.deployed_at.desc())
    output_result = await db.execute(output_stmt)
    deployment = output_result.scalars().first()

    engine = OptimaEngine(tenant_id=tenant_id)
    levers = engine.calculate_levers(plan.resources, plan.approved_total)
    opt_potential = engine.calculate_optimization_potential(plan.resources)

    return {
        "tenantId": tenant_id,
        "phase1Baseline": {
            "approvedTotal": plan.approved_total,
            "budgetCeiling": plan.budget_ceiling,
            "resourceCount": len(plan.resources),
            "approvedAt": plan.approved_at.isoformat() if plan.approved_at else None,
        },
        "infrastructure": {
            "deployed": deployment is not None,
            "aksCluster": deployment.aks_cluster_name if deployment else None,
            "postgresqlFqdn": deployment.postgresql_fqdn if deployment else None,
            "openaiEndpoint": deployment.openai_endpoint if deployment else None,
        },
        "optimizationLevers": levers,
        "optimizationPotential": opt_potential,
        "resources": plan.resources,
    }


@router.get("/cost-breakdown/{tenant_id}")
async def get_cost_breakdown(tenant_id: str, db: AsyncSession = Depends(get_db)):
    """
    Phase 2 Screen 2: Cost Breakdown.
    Maps each Phase 1 provisioned resource to its live cloud identifier
    from outputs.json (Stage 5), then calculates per-resource optimization opportunity.
    """
    plan_stmt = select(ResourcePlan).where(ResourcePlan.tenant_id == tenant_id).order_by(ResourcePlan.created_at.desc())
    plan = (await db.execute(plan_stmt)).scalars().first()
    if not plan:
        raise HTTPException(status_code=424, detail="Complete Stage 3 (Cost Review) in Phase 1 first.")

    output_stmt = select(DeploymentOutput).where(DeploymentOutput.tenant_id == tenant_id).order_by(DeploymentOutput.deployed_at.desc())
    deployment = (await db.execute(output_stmt)).scalars().first()

    engine = OptimaEngine(tenant_id=tenant_id)
    breakdown = engine.build_cost_breakdown(plan.resources, deployment)
    return {
        "tenantId": tenant_id,
        "totalMonthly": plan.approved_total,
        "budgetCeiling": plan.budget_ceiling,
        "deployed": deployment is not None,
        "resources": breakdown,
    }


@router.post("/recommendations/generate/{tenant_id}")
async def generate_recommendations(tenant_id: str, db: AsyncSession = Depends(get_db)):
    """
    Phase 2 Screen 3: Generate OPTIMA-AI recommendations.
    Builds recommendations specific to the exact resources provisioned in Phase 1.
    Each recommendation references an actual resource name from outputs.json.
    """
    plan_stmt = select(ResourcePlan).where(ResourcePlan.tenant_id == tenant_id).order_by(ResourcePlan.created_at.desc())
    plan = (await db.execute(plan_stmt)).scalars().first()
    if not plan:
        raise HTTPException(status_code=424, detail="Complete Stage 3 in Phase 1 first.")

    output_stmt = select(DeploymentOutput).where(DeploymentOutput.tenant_id == tenant_id).order_by(DeploymentOutput.deployed_at.desc())
    deployment = (await db.execute(output_stmt)).scalars().first()

    engine = OptimaEngine(tenant_id=tenant_id)
    rec_templates = engine.build_recommendations(plan.resources, deployment, tenant_id)

    saved = []
    for tmpl in rec_templates:
        rec = OptimizationRecommendation(
            tenant_id=tenant_id,
            deployment_output_id=deployment.id if deployment else None,
            rec_id=tmpl["rec_id"],
            lever=tmpl["lever"],
            severity=tmpl["severity"],
            title=tmpl["title"],
            detail=tmpl["detail"],
            resource_name=tmpl.get("resource_name"),
            resource_identifier=tmpl.get("resource_identifier"),
            estimated_monthly_saving=tmpl["saving"],
            effort=tmpl["effort"],
            risk=tmpl["risk"],
            action_description=tmpl["action"],
        )
        db.add(rec)
        saved.append(rec)
    await db.commit()

    return {
        "tenantId": tenant_id,
        "recommendationsGenerated": len(saved),
        "totalPotentialSaving": sum(r.estimated_monthly_saving for r in saved),
        "recommendations": [r.to_dict() for r in saved],
    }


@router.get("/recommendations/{tenant_id}")
async def get_recommendations(tenant_id: str, db: AsyncSession = Depends(get_db)):
    stmt = select(OptimizationRecommendation)\
        .where(OptimizationRecommendation.tenant_id == tenant_id)\
        .order_by(OptimizationRecommendation.created_at.desc())
    result = await db.execute(stmt)
    recs = result.scalars().all()
    return {"tenantId": tenant_id, "recommendations": [r.to_dict() for r in recs]}


class ApprovalPayload(BaseModel):
    decision: str   # approved | rejected
    decided_by: str
    reason: Optional[str] = None

@router.patch("/recommendations/{rec_id}/approve")
async def approve_recommendation(
    rec_id: str, payload: ApprovalPayload, db: AsyncSession = Depends(get_db)
):
    """
    Phase 2 Screen 4: Approve or reject a recommendation.
    Approved recommendations are queued for execution through the Phase 1
    Terraform pipeline (same Stage 4 HCL + Stage 5 Execution Engine).
    OPTIMA-AI never auto-applies changes.
    """
    rec = await db.get(OptimizationRecommendation, rec_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Recommendation not found")

    rec.status = payload.decision
    if payload.decision == "approved":
        rec.approved_by = payload.decided_by
        rec.approved_at = datetime.utcnow()
    else:
        rec.rejected_reason = payload.reason

    audit = ApprovalRecord(
        recommendation_id=rec_id,
        tenant_id=rec.tenant_id,
        decision=payload.decision,
        decided_by=payload.decided_by,
        reason=payload.reason,
    )
    db.add(audit)
    await db.commit()
    return {"recommendationId": rec_id, "status": rec.status, "decidedBy": payload.decided_by}


@router.get("/savings/{tenant_id}")
async def get_savings_dashboard(tenant_id: str, db: AsyncSession = Depends(get_db)):
    """
    Phase 2 Screen 5: Savings Dashboard.
    Compares realized savings against Phase 1 Stage 3 approved cost baseline.
    """
    plan_stmt = select(ResourcePlan).where(ResourcePlan.tenant_id == tenant_id).order_by(ResourcePlan.created_at.desc())
    plan = (await db.execute(plan_stmt)).scalars().first()

    rec_stmt = select(OptimizationRecommendation).where(OptimizationRecommendation.tenant_id == tenant_id)
    all_recs = (await db.execute(rec_stmt)).scalars().all()
    approved = [r for r in all_recs if r.status == "approved"]
    executed = [r for r in all_recs if r.status == "executed"]

    baseline = plan.approved_total if plan else 0
    projected_saving = sum(r.estimated_monthly_saving for r in approved)
    realized_saving  = sum(r.estimated_monthly_saving for r in executed)
    optimised_cost   = baseline - projected_saving

    return {
        "tenantId": tenant_id,
        "phase1Baseline": baseline,
        "budgetCeiling": plan.budget_ceiling if plan else 0,
        "approvedSaving": projected_saving,
        "realizedSaving": realized_saving,
        "optimisedCost": optimised_cost,
        "realizationRate": round(realized_saving / projected_saving, 3) if projected_saving > 0 else 0,
        "recommendations": {
            "total": len(all_recs),
            "approved": len(approved),
            "executed": len(executed),
            "pending": len([r for r in all_recs if r.status == "pending"]),
            "rejected": len([r for r in all_recs if r.status == "rejected"]),
        }
    }
