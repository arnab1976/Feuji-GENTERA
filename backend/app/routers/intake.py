"""Stage 1 — Project Intake Form (submit, list, approve). Multi-level RBAC approval workflow."""
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, Field
from app.database import get_db
from app.models.workflow import IntakeForm
from app.models.tenant import Tenant
from app.services.activity_service import log_activity

router = APIRouter()

# Multi-level RBAC Status Machine:
#   pending_tenant_approval    — Tenant User submitted; awaiting Tenant Admin approval
#   pending_provider_approval  — Tenant Admin approved (or submitted); awaiting Provider Admin approval
#   queued_for_recommendation  — Provider Admin approved (or Provider Admin submitted); Stage 2 AI unlocked
#   rejected                   — Rejected / Denied by Tenant Admin or Provider Admin

APPROVERS = {"Provider Admin", "Tenant Admin"}
SUBMITTERS = {"Provider Admin", "Tenant Admin", "Tenant User"}


class IntakePayload(BaseModel):
    tenant_id: str
    project_name: str
    cloud: str  # aws | azure
    app_category: str  # rag | agent | summariser | finetuning
    environment: str = "prod"
    compliance: str = "HIPAA"
    budget_ceiling: int = 2000
    description: str = ""
    submitted_by: str = "Tenant User"
    submitted_by_role: str = "Tenant User"
    submitted_by_email: str | None = None
    tenant_user_id: str | None = None
    tenant_admin_name: str = "Tenant Admin"


class IntakeDecisionPayload(BaseModel):
    decision: str = Field(..., description="approve | reject")
    notes: str = ""
    actor_role: str = "Tenant Admin"
    actor_name: str = "Tenant Admin"
    # Optional fields modified during review/approval
    project_name: str | None = None
    cloud: str | None = None
    app_category: str | None = None
    environment: str | None = None
    compliance: str | None = None
    budget_ceiling: int | None = None
    description: str | None = None


def _serialize(form: IntakeForm, org_name: str | None = None) -> dict:
    return {
        "intakeId": form.id,
        "tenantId": form.tenant_id,
        "tenantName": org_name,
        "project": form.project_name,
        "cloud": form.cloud,
        "appCategory": form.app_category,
        "environment": form.environment,
        "compliance": form.compliance,
        "budgetCeiling": form.budget_ceiling,
        "description": form.description or "",
        "status": form.status,
        "submittedBy": form.submitted_by,
        "submittedByRole": form.submitted_by_role,
        "approvedBy": form.approved_by,
        "approvedAt": form.approved_at.isoformat() if form.approved_at else None,
        "reviewNotes": form.review_notes or "",
        "submittedAt": form.submitted_at.isoformat() if form.submitted_at else None,
    }


@router.post("/intake/submit")
async def submit_intake(payload: IntakePayload, db: AsyncSession = Depends(get_db)):
    """
    Submit Project Intake Form.
    RBAC Rules:
      1. Tenant User submitted -> pending_tenant_approval (requires Tenant Admin approval, then Provider Admin)
      2. Tenant Admin submitted -> pending_provider_approval (requires Provider Admin approval)
      3. Provider Admin submitted -> queued_for_recommendation (Auto-approved)
    """
    role = (payload.submitted_by_role or "Tenant User").strip()
    if role not in SUBMITTERS:
        raise HTTPException(status_code=403, detail=f"Role '{role}' cannot submit Project Intake")

    tenant = await db.get(Tenant, payload.tenant_id)
    if not tenant or getattr(tenant, "archived", False):
        raise HTTPException(status_code=404, detail="Tenant not found or archived")

    org = tenant.org_name or payload.tenant_id

    # Display name for submitter
    submitter_name = payload.submitted_by or role
    if payload.submitted_by_email and payload.submitted_by_email not in submitter_name:
        submitter_name = f"{submitter_name} ({payload.submitted_by_email})"

    # Determine initial status based on submitter role
    if role == "Provider Admin":
        status = "queued_for_recommendation"
        notes = "Auto-approved (submitted by Provider Admin)"
        approved_by = payload.submitted_by or role
        approved_at = datetime.utcnow()
    elif role == "Tenant Admin":
        status = "pending_provider_approval"
        notes = "Submitted by Tenant Admin — awaiting Provider Admin level approval"
        approved_by = None
        approved_at = None
    else:
        status = "pending_tenant_approval"
        notes = f"Submitted by Tenant User {submitter_name} — awaiting Tenant Admin approval"
        approved_by = None
        approved_at = None

    form = IntakeForm(
        tenant_id=payload.tenant_id,
        project_name=payload.project_name.strip(),
        cloud=payload.cloud,
        app_category=payload.app_category,
        environment=payload.environment,
        compliance=payload.compliance,
        budget_ceiling=payload.budget_ceiling,
        description=payload.description or "",
        status=status,
        submitted_by=submitter_name,
        submitted_by_role=role,
        approved_by=approved_by,
        approved_at=approved_at,
        review_notes=notes,
    )
    db.add(form)
    await db.flush()

    # Log Activity Feed notifications
    if role == "Provider Admin":
        await log_activity(
            db,
            kind="intake",
            from_role="Provider Admin",
            to_role="AI Engine",
            from_name=submitter_name,
            to_name="Stage 2 — AI Recommendation",
            message="Project Intake submitted & auto-approved",
            detail=f"{payload.project_name} · {org} — AI recommendation & workflow unlocked",
            tenant_id=payload.tenant_id,
            unread=True,
        )
    elif role == "Tenant Admin":
        await log_activity(
            db,
            kind="intake",
            from_role="Tenant Admin",
            to_role="Provider Admin",
            from_name=submitter_name,
            to_name="Provider Admin",
            message="Project Intake submitted by Tenant Admin — awaiting Provider Admin approval",
            detail=f"{payload.project_name} · {org} — Requires Provider Admin sign-off before Stage 2",
            tenant_id=payload.tenant_id,
            unread=True,
        )
    else:
        await log_activity(
            db,
            kind="intake",
            from_role="Tenant User",
            to_role="Tenant Admin",
            from_name=submitter_name,
            to_name=payload.tenant_admin_name or "Tenant Admin",
            message=f"Project Intake submitted by Tenant User {submitter_name} — awaiting Tenant Admin approval",
            detail=f"{payload.project_name} · {org} — Awaiting Tenant Admin approval before forwarding to Provider Admin",
            tenant_id=payload.tenant_id,
            unread=True,
        )

    await db.commit()
    await db.refresh(form)
    return _serialize(form, org)


@router.get("/intake/list")
async def list_intakes(
    status: str | None = Query(None),
    tenant_id: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """List project intakes (optionally filter by status / tenant)."""
    q = select(IntakeForm).order_by(IntakeForm.submitted_at.desc())
    if status:
        q = q.where(IntakeForm.status == status)
    if tenant_id:
        q = q.where(IntakeForm.tenant_id == tenant_id)
    result = await db.execute(q)
    forms = result.scalars().all()

    tenant_ids = {f.tenant_id for f in forms}
    names: dict[str, str] = {}
    if tenant_ids:
        tres = await db.execute(select(Tenant).where(Tenant.id.in_(tenant_ids)))
        for t in tres.scalars().all():
            names[t.id] = t.org_name

    return {"items": [_serialize(f, names.get(f.tenant_id)) for f in forms]}


@router.get("/intake/{intake_id}")
async def get_intake(intake_id: str, db: AsyncSession = Depends(get_db)):
    form = await db.get(IntakeForm, intake_id)
    if not form:
        raise HTTPException(status_code=404, detail="Intake form not found")
    tenant = await db.get(Tenant, form.tenant_id)
    return _serialize(form, tenant.org_name if tenant else None)


@router.patch("/intake/{intake_id}/approve")
async def decide_intake(
    intake_id: str,
    payload: IntakeDecisionPayload,
    db: AsyncSession = Depends(get_db),
):
    """
    Multi-level RBAC Decision Endpoint.
    - Tenant Admin approving pending_tenant_approval -> pending_provider_approval
    - Provider Admin approving pending_provider_approval (or pending_tenant_approval) -> queued_for_recommendation
    - Either role rejecting -> rejected
    """
    actor = (payload.actor_role or "").strip()
    if actor not in APPROVERS:
        raise HTTPException(
            status_code=403,
            detail="Only Tenant Admin or Provider Admin can approve Project Intake",
        )

    form = await db.get(IntakeForm, intake_id)
    if not form:
        raise HTTPException(status_code=404, detail="Intake form not found")

    decision = (payload.decision or "").strip().lower()
    if decision not in ("approve", "reject"):
        raise HTTPException(status_code=400, detail="decision must be approve or reject")

    tenant = await db.get(Tenant, form.tenant_id)
    org = tenant.org_name if tenant else form.tenant_id

    # Check and apply form edits if provided
    edits = []
    if payload.project_name and payload.project_name.strip() != form.project_name:
        edits.append(f"Project Name updated to '{payload.project_name.strip()}'")
        form.project_name = payload.project_name.strip()
    if payload.cloud and payload.cloud != form.cloud:
        edits.append(f"Cloud updated to {payload.cloud.upper()}")
        form.cloud = payload.cloud
    if payload.app_category and payload.app_category != form.app_category:
        edits.append(f"App Category updated to {payload.app_category.upper()}")
        form.app_category = payload.app_category
    if payload.environment and payload.environment != form.environment:
        edits.append(f"Environment updated to {payload.environment}")
        form.environment = payload.environment
    if payload.compliance and payload.compliance != form.compliance:
        edits.append(f"Compliance updated to {payload.compliance}")
        form.compliance = payload.compliance
    if payload.budget_ceiling is not None and payload.budget_ceiling != form.budget_ceiling:
        edits.append(f"Budget Ceiling updated to ${payload.budget_ceiling}/mo")
        form.budget_ceiling = payload.budget_ceiling
    if payload.description is not None and payload.description.strip() != form.description:
        edits.append("Description updated")
        form.description = payload.description.strip()

    notes_text = payload.notes.strip() if payload.notes else ""
    if edits:
        edit_summary = "; ".join(edits)
        notes_text = f"{notes_text} (Adjustments by {actor}: {edit_summary})".strip()

    if decision == "reject":
        form.status = "rejected"
        form.approved_by = payload.actor_name or actor
        form.approved_at = datetime.utcnow()
        form.review_notes = notes_text or f"Rejected by {actor}"
        
        await log_activity(
            db,
            kind="intake",
            from_role=actor,
            to_role=form.submitted_by_role or "Tenant User",
            from_name=payload.actor_name or actor,
            to_name=form.submitted_by or "Submitter",
            message=f"Project Intake rejected by {actor}",
            detail=f"{form.project_name} · {org} — Status updated to Rejected"
            + (f" · Notes: {notes_text}" if notes_text else ""),
            tenant_id=form.tenant_id,
            unread=True,
        )

    elif decision == "approve":
        if actor == "Tenant Admin":
            # Tenant Admin approves Tenant User submission -> Forward to Provider Admin
            form.status = "pending_provider_approval"
            form.review_notes = notes_text or "Tenant Admin approved. Forwarded to Provider Admin."
            
            await log_activity(
                db,
                kind="intake",
                from_role="Tenant Admin",
                to_role="Provider Admin",
                from_name=payload.actor_name or "Tenant Admin",
                to_name="Provider Admin",
                message="Tenant Admin approved Project Intake — forwarded to Provider Admin",
                detail=f"{form.project_name} · {org} — Requires final Provider Admin level approval"
                + (f" · Notes: {notes_text}" if notes_text else ""),
                tenant_id=form.tenant_id,
                unread=True,
            )
        elif actor == "Provider Admin":
            # Provider Admin approves -> Final Stage 2 Unlock
            form.status = "queued_for_recommendation"
            form.approved_by = payload.actor_name or "Provider Admin"
            form.approved_at = datetime.utcnow()
            form.review_notes = notes_text or "Provider Admin approved. AI Recommendation unlocked."
            
            await log_activity(
                db,
                kind="intake",
                from_role="Provider Admin",
                to_role="AI Engine",
                from_name=payload.actor_name or "Provider Admin",
                to_name="Stage 2 — AI Recommendation",
                message="Provider Admin approved Project Intake — AI Recommendation Unlocked",
                detail=f"{form.project_name} · {org} — AI recommendation & workflow unlocked"
                + (f" · Notes: {notes_text}" if notes_text else ""),
                tenant_id=form.tenant_id,
                unread=True,
            )

    await db.commit()
    await db.refresh(form)
    return _serialize(form, org)


@router.delete("/intake/{intake_id}")
async def delete_intake(intake_id: str, db: AsyncSession = Depends(get_db)):
    """Delete a project intake form by ID."""
    form = await db.get(IntakeForm, intake_id)
    if not form:
        raise HTTPException(status_code=404, detail="Intake form not found")
    await db.delete(form)
    await db.commit()
    return {"deleted": True, "intakeId": intake_id}
