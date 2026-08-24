"""Stage 1 — Project Intake Form (submit, list, approve). Multi-level RBAC approval workflow."""
from datetime import datetime, timedelta
import secrets
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
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
UNLOCK_TOKEN_TTL_MINUTES = 5


class IntakePayload(BaseModel):
    tenant_id: str
    project_name: str
    cloud: str  # aws | azure | gcp
    app_category: str  # rag | agent | summariser | finetuning
    environment: str = "prod"
    compliance: str = "HIPAA"
    budget_ceiling: int = 2000
    description: str = ""
    submitted_by: str = "Tenant User"
    submitted_by_role: str = "Tenant User"
    submitted_by_email: str | None = None
    tenant_user_id: str | None = None
    tenant_user_name: str | None = None
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


class VerifyUnlockTokenPayload(BaseModel):
    token: str = Field(..., min_length=16, max_length=16, description="16-character alphanumeric unlock JWT")


UNLOCK_TOKEN_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"


def _generate_unlock_token() -> str:
    """Cryptographically strong 16-character alphanumeric unlock JWT (A–Z, 0–9)."""
    return "".join(secrets.choice(UNLOCK_TOKEN_ALPHABET) for _ in range(16))


def _issue_unlock_token(form: IntakeForm) -> str:
    token = _generate_unlock_token()
    form.unlock_token = token
    form.unlock_token_expires_at = datetime.utcnow() + timedelta(minutes=UNLOCK_TOKEN_TTL_MINUTES)
    form.unlock_token_consumed_at = None
    return token


def _token_still_valid(form: IntakeForm) -> bool:
    if not form.unlock_token or not form.unlock_token_expires_at:
        return False
    if form.unlock_token_consumed_at:
        return False
    return datetime.utcnow() <= form.unlock_token_expires_at


def _expire_unlock_if_needed(form: IntakeForm) -> bool:
    """
    If unlock token expired unused while queued, revoke Stage 2 and require
    Tenant Admin + Provider Admin approval again.
    Returns True if status was rolled back.
    """
    if form.status != "queued_for_recommendation":
        return False
    if form.unlock_token_consumed_at:
        return False
    if not form.unlock_token_expires_at:
        return False
    if datetime.utcnow() <= form.unlock_token_expires_at:
        return False

    form.status = "pending_tenant_approval"
    form.unlock_token = None
    form.unlock_token_expires_at = None
    form.approved_by = None
    form.approved_at = None
    form.review_notes = (
        "Unlock JWT token expired (5 minutes). "
        "Tenant Admin and Provider Admin level approval are required again before Stage 2."
    )
    return True


def _serialize(form: IntakeForm, org_name: str | None = None) -> dict:
    valid = _token_still_valid(form)
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
        "tenantUserId": form.tenant_user_id,
        "tenantUserName": form.tenant_user_name,
        "approvedBy": form.approved_by,
        "approvedAt": form.approved_at.isoformat() if form.approved_at else None,
        "reviewNotes": form.review_notes or "",
        "submittedAt": form.submitted_at.isoformat() if form.submitted_at else None,
        "unlockToken": form.unlock_token if valid else None,
        "unlockTokenExpiresAt": (
            form.unlock_token_expires_at.isoformat() if form.unlock_token_expires_at else None
        ),
        "unlockTokenValid": valid,
        "unlockTokenConsumed": bool(form.unlock_token_consumed_at),
    }


async def _resolve_tenant_user_name(
    db: AsyncSession,
    *,
    tenant_id: str | None,
    tenant_user_id: str | None,
    tenant_user_name: str | None,
    submitted_by: str | None,
    submitted_by_role: str | None,
) -> tuple[str | None, str | None]:
    """Return (tenant_user_id, tenant_user_name) for notification display."""
    from app.models.invitation import UserInvitation

    # Explicit name / id from payload or stored columns
    if tenant_user_name and str(tenant_user_name).strip():
        name = str(tenant_user_name).strip()
        if tenant_user_id:
            return tenant_user_id, name
        return None, name

    if tenant_user_id:
        invite = await db.get(UserInvitation, tenant_user_id)
        if invite and invite.full_name:
            return invite.id, invite.full_name

    # Tenant User submitter: submitted_by already holds the person name
    role = (submitted_by_role or "").strip()
    submitter = (submitted_by or "").strip()
    role_labels = {"Provider Admin", "Tenant Admin", "Provider User", "Tenant User"}
    if role == "Tenant User" and submitter and submitter not in role_labels:
        # Prefer matching invite under tenant
        if tenant_id:
            result = await db.execute(
                select(UserInvitation).where(
                    UserInvitation.role == "TENANT_USER",
                    UserInvitation.tenant_id == tenant_id,
                    UserInvitation.archived.is_(False),
                    UserInvitation.decommissioned.is_(False),
                    func.lower(UserInvitation.full_name) == submitter.lower(),
                ).limit(1)
            )
            match = result.scalars().first()
            if match:
                return match.id, match.full_name
        return None, submitter

    # Fallback: approved Tenant User for this tenant (unique if only one)
    if tenant_id:
        result = await db.execute(
            select(UserInvitation).where(
                UserInvitation.role == "TENANT_USER",
                UserInvitation.tenant_id == tenant_id,
                UserInvitation.archived.is_(False),
                UserInvitation.decommissioned.is_(False),
                UserInvitation.status == "ACCEPTED",
            ).order_by(UserInvitation.created_at.asc())
        )
        users = list(result.scalars().all())
        if len(users) == 1:
            return users[0].id, users[0].full_name
        if len(users) > 1:
            # Prefer name match against submitter fragments if any
            return users[0].id, users[0].full_name

    return tenant_user_id, None


async def _enrich_intake_dict(form: IntakeForm, org_name: str | None, db: AsyncSession) -> dict:
    data = _serialize(form, org_name)
    tu_id, tu_name = await _resolve_tenant_user_name(
        db,
        tenant_id=form.tenant_id,
        tenant_user_id=form.tenant_user_id,
        tenant_user_name=form.tenant_user_name,
        submitted_by=form.submitted_by,
        submitted_by_role=form.submitted_by_role,
    )
    # Persist resolved name for future loads when missing
    if tu_name and not form.tenant_user_name:
        form.tenant_user_name = tu_name
        if tu_id and not form.tenant_user_id:
            form.tenant_user_id = tu_id
    data["tenantUserId"] = tu_id or form.tenant_user_id
    data["tenantUserName"] = tu_name or form.tenant_user_name
    return data


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

    tu_id, tu_name = await _resolve_tenant_user_name(
        db,
        tenant_id=payload.tenant_id,
        tenant_user_id=payload.tenant_user_id,
        tenant_user_name=payload.tenant_user_name,
        submitted_by=submitter_name,
        submitted_by_role=role,
    )
    # Prefer explicit payload tenant user name when still resolving
    if not tu_name and payload.tenant_user_name:
        tu_name = payload.tenant_user_name.strip()
    if role == "Tenant User" and not tu_name:
        tu_name = submitter_name

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
        tenant_user_id=tu_id or payload.tenant_user_id,
        tenant_user_name=tu_name,
    )
    db.add(form)
    await db.flush()

    unlock_token: str | None = None
    if role == "Provider Admin":
        unlock_token = _issue_unlock_token(form)
        form.review_notes = (
            f"Auto-approved (submitted by Provider Admin). "
            f"16-character alphanumeric unlock JWT token issued for Tenant User — expires in {UNLOCK_TOKEN_TTL_MINUTES} minutes. "
            f"Token: {unlock_token}"
            + (f" · Tenant_User: {tu_name}" if tu_name else "")
        )

    # Log Activity Feed notifications
    if role == "Provider Admin":
        await log_activity(
            db,
            kind="intake",
            from_role="Provider Admin",
            to_role="Tenant User",
            from_name=submitter_name,
            to_name="Tenant User",
            message="16-character alphanumeric unlock JWT generated — start journey within 5 minutes",
            detail=(
                f"{payload.project_name} · {org} — Token: {unlock_token} · "
                f"Expires in {UNLOCK_TOKEN_TTL_MINUTES} minutes. Use it to Run AI Recommendation Engine."
            ),
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
    return await _enrich_intake_dict(form, org, db)


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

    expired_any = False
    for f in forms:
        if _expire_unlock_if_needed(f):
            expired_any = True
            await log_activity(
                db,
                kind="intake",
                from_role="System",
                to_role="Tenant User",
                from_name="Unlock JWT Gate",
                to_name=f.submitted_by or "Tenant User",
                message="Unlock JWT token expired — re-approval required",
                detail=(
                    f"{f.project_name} — 5-minute token expired unused. "
                    "Request Tenant Admin and Provider Admin approval again."
                ),
                tenant_id=f.tenant_id,
                unread=True,
            )
    if expired_any:
        await db.flush()

    tenant_ids = {f.tenant_id for f in forms}
    names: dict[str, str] = {}
    if tenant_ids:
        tres = await db.execute(select(Tenant).where(Tenant.id.in_(tenant_ids)))
        for t in tres.scalars().all():
            names[t.id] = t.org_name

    return {
        "items": [
            await _enrich_intake_dict(f, names.get(f.tenant_id), db)
            for f in forms
        ]
    }


@router.get("/intake/{intake_id}")
async def get_intake(intake_id: str, db: AsyncSession = Depends(get_db)):
    form = await db.get(IntakeForm, intake_id)
    if not form:
        raise HTTPException(status_code=404, detail="Intake form not found")
    if _expire_unlock_if_needed(form):
        await db.flush()
    tenant = await db.get(Tenant, form.tenant_id)
    return await _enrich_intake_dict(form, tenant.org_name if tenant else None, db)


@router.patch("/intake/{intake_id}/approve")
async def decide_intake(
    intake_id: str,
    payload: IntakeDecisionPayload,
    db: AsyncSession = Depends(get_db),
):
    """
    Multi-level RBAC Decision Endpoint (strict 2-factor — neither step overrides the other).
    - Tenant Admin: only pending_tenant_approval → pending_provider_approval (does NOT unlock AI)
    - Provider Admin: only pending_provider_approval → queued_for_recommendation (unlocks AI)
    - Provider Admin cannot approve while still Pending with Tenant Admin
    - Tenant Admin cannot unlock AI / cannot skip Provider Level Sign-Off
    - Either role may reject → rejected
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
        if actor == "Tenant Admin" and form.status != "pending_tenant_approval":
            raise HTTPException(
                status_code=400,
                detail="Tenant Admin can only reject intakes that are Pending with Tenant Admin.",
            )
        if actor == "Provider Admin" and form.status not in (
            "pending_provider_approval",
            "pending_tenant_approval",
        ):
            raise HTTPException(
                status_code=400,
                detail="Provider Admin can only reject intakes awaiting approval.",
            )
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
            # Strict RBAC Step 1 — Tenant Admin may only act on TA queue
            if form.status != "pending_tenant_approval":
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Tenant Admin cannot approve intake in status '{form.status}'. "
                        "Only intakes Pending with Tenant Admin can receive Tenant Admin sign-off. "
                        "Provider Admin approval is a separate required step."
                    ),
                )
            # Forward to Provider Admin — does NOT unlock AI / does NOT override Provider step
            form.status = "pending_provider_approval"
            form.review_notes = notes_text or (
                "Tenant Admin approved (Step 1/2). Awaiting required Provider Admin Level Sign-Off — "
                "Tenant Admin approval does not unlock AI Engine."
            )

            await log_activity(
                db,
                kind="intake",
                from_role="Tenant Admin",
                to_role="Provider Admin",
                from_name=payload.actor_name or "Tenant Admin",
                to_name="Provider Admin",
                message="Tenant Admin approved Project Intake — Provider Admin approval still required",
                detail=f"{form.project_name} · {org} — Step 1/2 complete. Provider Admin Level Sign-Off required before AI / cost / Terraform"
                + (f" · Notes: {notes_text}" if notes_text else ""),
                tenant_id=form.tenant_id,
                unread=True,
            )
        elif actor == "Provider Admin":
            # Strict RBAC Step 2 — Provider Admin cannot bypass Tenant Admin
            if form.status != "pending_provider_approval":
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Provider Admin cannot approve intake in status '{form.status}'. "
                        "Tenant Admin must approve first (Pending with Tenant Admin). "
                        "Provider Level Sign-Off is only available after Step 1."
                    ),
                )
            # Final unlock — only Provider Admin unlocks AI; issue 16-char alphanumeric JWT (5 min)
            form.status = "queued_for_recommendation"
            form.approved_by = payload.actor_name or "Provider Admin"
            form.approved_at = datetime.utcnow()
            unlock_token = _issue_unlock_token(form)
            form.review_notes = (
                (notes_text + " · " if notes_text else "")
                + "Approved by Provider Admin (Step 2/2) — AI Engine unlocked. "
                + f"16-character alphanumeric unlock JWT token generated for Tenant User "
                + f"(expires in {UNLOCK_TOKEN_TTL_MINUTES} minutes): {unlock_token}"
            )

            await log_activity(
                db,
                kind="intake",
                from_role="Provider Admin",
                to_role="Tenant User",
                from_name=payload.actor_name or "Provider Admin",
                to_name=form.submitted_by or "Tenant User",
                message="16-character alphanumeric unlock JWT generated — start journey within 5 minutes",
                detail=(
                    f"{form.project_name} · {org} — Token: {unlock_token} · "
                    f"Expires in {UNLOCK_TOKEN_TTL_MINUTES} minutes. "
                    "Enter this token when clicking Run AI Recommendation Engine."
                ),
                tenant_id=form.tenant_id,
                unread=True,
            )
            await log_activity(
                db,
                kind="intake",
                from_role="Provider Admin",
                to_role="AI Engine",
                from_name=payload.actor_name or "Provider Admin",
                to_name="Stage 2 — AI Recommendation",
                message="Provider Admin approved Project Intake — AI Recommendation Unlocked",
                detail=f"{form.project_name} · {org} — Two-factor approval complete. Tenant User must enter unlock JWT within 5 minutes"
                + (f" · Notes: {notes_text}" if notes_text else ""),
                tenant_id=form.tenant_id,
                unread=True,
            )

    await db.commit()
    await db.refresh(form)
    return _serialize(form, org)


@router.post("/intake/{intake_id}/verify-unlock-token")
async def verify_unlock_token(
    intake_id: str,
    payload: VerifyUnlockTokenPayload,
    db: AsyncSession = Depends(get_db),
):
    """
    Tenant User enters the 16-character alphanumeric unlock JWT to start Stage 2 (AI Recommendation).
    Token is single-use and expires in 5 minutes. On expiry/invalid → re-approval required.
    """
    form = await db.get(IntakeForm, intake_id)
    if not form:
        raise HTTPException(status_code=404, detail="Intake form not found")

    if _expire_unlock_if_needed(form):
        await db.flush()
        raise HTTPException(
            status_code=400,
            detail=(
                "Unlock JWT token expired (5 minutes). "
                "Tenant Admin and Provider Admin level approval are required again."
            ),
        )

    if form.status != "queued_for_recommendation":
        raise HTTPException(
            status_code=400,
            detail=(
                f"Intake status is '{form.status}'. "
                "Provider Admin must approve and issue an unlock JWT before starting Stage 2."
            ),
        )

    # Already consumed — allow resume without re-entry
    if form.unlock_token_consumed_at:
        tenant = await db.get(Tenant, form.tenant_id)
        return {
            **_serialize(form, tenant.org_name if tenant else None),
            "verified": True,
            "alreadyConsumed": True,
        }

    token = (payload.token or "").strip().upper()
    if len(token) != 16 or any(c not in UNLOCK_TOKEN_ALPHABET for c in token):
        raise HTTPException(
            status_code=400,
            detail="Unlock JWT must be exactly 16 alphanumeric characters (A–Z, 0–9).",
        )

    if not form.unlock_token or token != form.unlock_token.upper():
        raise HTTPException(status_code=401, detail="Invalid unlock JWT token.")

    if not _token_still_valid(form):
        _expire_unlock_if_needed(form)
        await db.flush()
        raise HTTPException(
            status_code=400,
            detail=(
                "Unlock JWT token expired (5 minutes). "
                "Tenant Admin and Provider Admin level approval are required again."
            ),
        )

    form.unlock_token_consumed_at = datetime.utcnow()
    form.review_notes = (
        "Approved by Provider Admin (Step 2/2) — AI Engine unlocked. "
        "Unlock JWT verified by Tenant User — journey started. "
        "Token entry is not required again for this intake."
    )
    await db.flush()
    tenant = await db.get(Tenant, form.tenant_id)
    return {
        **_serialize(form, tenant.org_name if tenant else None),
        "verified": True,
        "alreadyConsumed": False,
    }


@router.delete("/intake/{intake_id}")
async def delete_intake(intake_id: str, db: AsyncSession = Depends(get_db)):
    """Delete a project intake form by ID."""
    form = await db.get(IntakeForm, intake_id)
    if not form:
        raise HTTPException(status_code=404, detail="Intake form not found")
    await db.delete(form)
    await db.commit()
    return {"deleted": True, "intakeId": intake_id}
