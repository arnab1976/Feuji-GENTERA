"""User invitations — POST /invite/create, GET /invites"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, EmailStr, field_validator
from app.database import get_db
from app.models.invitation import UserInvitation
from app.models.tenant import Tenant
from app.models.provider import Provider
from app.services.activity_service import log_activity

router = APIRouter()


def _role_label(role: str) -> str:
    return {
        "PROVIDER_USER": "Provider User",
        "TENANT_ADMIN": "Tenant Admin",
        "TENANT_USER": "Tenant User",
        "PROVIDER_ADMIN": "Provider Admin",
    }.get(role, role.replace("_", " ").title())


_ROLE_LABELS = {"Provider Admin", "Provider User", "Tenant Admin", "Tenant User"}


async def _tenant_admin_indexes(db: AsyncSession):
    """Map tenant_id / company → Tenant Admin invitation for ownership lookup."""
    result = await db.execute(
        select(UserInvitation).where(
            UserInvitation.role == "TENANT_ADMIN",
            UserInvitation.archived.is_(False),
            UserInvitation.decommissioned.is_(False),
        )
    )
    admins = result.scalars().all()
    by_tenant: dict[str, UserInvitation] = {}
    by_company: dict[str, UserInvitation] = {}
    for admin in admins:
        if admin.tenant_id:
            existing = by_tenant.get(admin.tenant_id)
            if not existing or admin.status == "ACCEPTED":
                by_tenant[admin.tenant_id] = admin
        key = (admin.company_name or "").strip().lower()
        if key:
            existing = by_company.get(key)
            if not existing or admin.status == "ACCEPTED":
                by_company[key] = admin
    return by_tenant, by_company


def _enrich_invite_dict(
    invite: UserInvitation,
    by_tenant: dict[str, UserInvitation],
    by_company: dict[str, UserInvitation],
) -> dict:
    """Attach tenantAdmin* fields so Tenant User → Tenant Admin ownership is visible."""
    data = invite.to_dict()
    if invite.role != "TENANT_USER":
        return data

    admin = None
    if invite.tenant_id and invite.tenant_id in by_tenant:
        admin = by_tenant[invite.tenant_id]
    if not admin:
        key = (invite.company_name or "").strip().lower()
        admin = by_company.get(key)

    intake = invite.intake_data if isinstance(invite.intake_data, dict) else {}
    invited_by = (invite.invited_by or "").strip()
    name_from_invite = invited_by if invited_by and invited_by not in _ROLE_LABELS else None

    name = (
        (admin.full_name if admin else None)
        or (intake.get("tenant_admin_name") if isinstance(intake.get("tenant_admin_name"), str) else None)
        or name_from_invite
    )
    email = (admin.email if admin else None) or intake.get("tenant_admin_email")
    admin_id = (admin.id if admin else None) or intake.get("tenant_admin_invite_id")

    data["tenantAdmin"] = name
    data["tenantAdminName"] = name
    data["tenantAdminEmail"] = email
    data["tenantAdminId"] = admin_id
    return data


class InviteCreate(BaseModel):
    full_name: str
    email: EmailStr
    role: str  # PROVIDER_USER | TENANT_ADMIN | TENANT_USER
    company_name: str
    provider_id: str | None = None
    department: str | None = None
    job_title: str | None = None
    function_area: str | None = None
    portfolio_scope: str | None = None
    contribution: str | None = None
    capabilities: dict | None = None
    provider_notes: str | None = None
    invited_by: str = "Provider Admin"
    # Tenant User requirement form extras
    project: str | None = None
    environment: str | None = None
    access_scope: str | None = None
    primary_cloud: str | None = None
    compliance: str | None = None
    description: str | None = None
    tenant_id: str | None = None
    # Owning Tenant Admin identity (stored on TENANT_USER intake)
    tenant_admin_name: str | None = None
    tenant_admin_email: str | None = None
    tenant_admin_invite_id: str | None = None

    @field_validator("email")
    @classmethod
    def normalize_email(cls, v: str) -> str:
        return v.strip().lower()

    @field_validator("role")
    @classmethod
    def validate_role(cls, v: str) -> str:
        allowed = {"PROVIDER_USER", "TENANT_ADMIN", "TENANT_USER"}
        if v not in allowed:
            raise ValueError(f"role must be one of {allowed}")
        return v


@router.post("/invite/create", status_code=status.HTTP_201_CREATED)
async def create_invite(payload: InviteCreate, db: AsyncSession = Depends(get_db)):
    """
    Persist a user invitation. For Tenant Admin, also registers the company
    as a tenant under the provider when it does not already exist.
    """
    company = payload.company_name.strip()
    if not company:
        raise HTTPException(status_code=400, detail="Company name is required.")

    # Resolve provider: exact ID → match by organisation name → any provider.
    # Local browser store may hold a stale ID from before DB persistence worked.
    provider = None
    if payload.provider_id:
        provider = await db.get(Provider, payload.provider_id)

    if not provider and company:
        by_name = await db.execute(
            select(Provider).where(func.lower(Provider.name) == company.lower())
        )
        provider = by_name.scalars().first()

    if not provider:
        fallback = await db.execute(select(Provider).order_by(Provider.created_at.desc()).limit(1))
        provider = fallback.scalar_one_or_none()

    if not provider:
        raise HTTPException(
            status_code=404,
            detail="No provider is registered in the database yet. Register a Provider first, then invite users.",
        )

    provider_id = provider.id

    tenant_id = None
    tenant_dict = None

    if payload.role == "TENANT_ADMIN":
        existing = await db.execute(
            select(Tenant).where(
                Tenant.provider_id == provider_id,
                func.lower(Tenant.org_name) == company.lower(),
            )
        )
        tenant = existing.scalar_one_or_none()
        if not tenant:
            tenant = Tenant(
                provider_id=provider_id,
                org_name=company,
                contact_email=payload.email,
                plan="PROFESSIONAL",
                primary_cloud="azure",
                compliance="HIPAA",
                budget_ceiling=2000,
            )
            db.add(tenant)
            await db.flush()
        tenant_id = tenant.id
        tenant_dict = tenant.to_dict()

    # Check if active invite already exists for this email
    existing_active = await db.execute(
        select(UserInvitation).where(
            func.lower(UserInvitation.email) == payload.email,
            UserInvitation.archived == False,
            UserInvitation.decommissioned == False,
        )
    )
    if existing_active.scalar_one_or_none():
        raise HTTPException(
            status_code=409,
            detail=f"An active invitation or requirement form for '{payload.email}' already exists.",
        )

    if payload.role == "TENANT_USER":
        # Prefer explicit tenant_id from Tenant Admin portal when provided
        if payload.tenant_id:
            linked = await db.get(Tenant, payload.tenant_id)
            if linked:
                tenant_id = linked.id
                tenant_dict = linked.to_dict()
                company = linked.org_name or company
                if linked.provider_id:
                    provider_id = linked.provider_id

        if not tenant_id:
            existing = await db.execute(
                select(Tenant).where(
                    func.lower(Tenant.org_name) == company.lower(),
                )
            )
            tenant = existing.scalars().first()
            if not tenant:
                # Ensure every tenant company has a generated Tenant ID
                tenant = Tenant(
                    provider_id=provider_id,
                    org_name=company,
                    contact_email=payload.email,
                    plan="PROFESSIONAL",
                    primary_cloud=(payload.primary_cloud or "azure").lower(),
                    compliance=payload.compliance or "HIPAA",
                    budget_ceiling=2000,
                )
                db.add(tenant)
                await db.flush()
            tenant_id = tenant.id
            tenant_dict = tenant.to_dict()
            if tenant.provider_id:
                provider_id = tenant.provider_id

    invite = UserInvitation(
        full_name=payload.full_name.strip(),
        email=payload.email,
        role=payload.role,
        company_name=company,
        provider_id=provider_id,
        tenant_id=tenant_id,
        department=payload.department,
        job_title=payload.job_title,
        function_area=payload.function_area,
        invited_by=payload.invited_by,
        status="PENDING",
    )
    # Provider User: invite only — intake registration happens later via Register Provider User.
    # Tenant User: profile is submitted with the invite and awaits Provider Admin approval.
    # Tenant Admin stays PENDING until Register Tenant Admin completes.
    if payload.role == "PROVIDER_USER" and payload.provider_notes:
        invite.provider_notes = payload.provider_notes.strip()
    if payload.role == "TENANT_USER":
        invite.intake_data = {
            "full_name": payload.full_name.strip(),
            "org_name": company,
            "contact_email": payload.email,
            "function_area": (payload.function_area or "").strip(),
            "job_title": (payload.job_title or "").strip(),
            "department": (payload.department or "").strip(),
            "project": (payload.project or "").strip(),
            "environment": (payload.environment or "prod").strip(),
            "access_scope": (payload.access_scope or payload.portfolio_scope or "workflow").strip(),
            "primary_cloud": (payload.primary_cloud or "azure").strip(),
            "compliance": (payload.compliance or "HIPAA").strip(),
            "description": (payload.description or payload.contribution or "").strip(),
            "contribution": (payload.contribution or payload.description or "").strip(),
            "invited_by": payload.invited_by or "Tenant Admin",
            "tenant_id": tenant_id,
            "tenant_admin_name": (payload.tenant_admin_name or "").strip() or None,
            "tenant_admin_email": (payload.tenant_admin_email or "").strip() or None,
            "tenant_admin_invite_id": (payload.tenant_admin_invite_id or "").strip() or None,
        }
        if payload.department:
            invite.department = payload.department.strip()
        if payload.job_title:
            invite.job_title = payload.job_title.strip()
    db.add(invite)
    await db.flush()

    to_role = _role_label(payload.role)
    detail_bits = [company]
    if payload.department:
        detail_bits.append(payload.department)
    if payload.function_area:
        detail_bits.append(payload.function_area)
    from_role = payload.invited_by if payload.invited_by in (
        "Provider Admin", "Provider User", "Tenant Admin", "Tenant User",
    ) else ("Tenant Admin" if payload.role == "TENANT_USER" else "Provider Admin")
    await log_activity(
        db,
        kind="invite",
        from_role=from_role,
        to_role=to_role,
        from_name=payload.invited_by or from_role,
        to_name=invite.full_name,
        message=(
            f"Invited as {to_role} — awaiting Provider Admin approval"
            if payload.role == "TENANT_USER"
            else f"Invited as {to_role}"
        ),
        detail=" · ".join(detail_bits),
        tenant_id=tenant_id,
        invite_id=invite.id,
        unread=True,
    )

    await db.commit()
    await db.refresh(invite)

    by_tenant, by_company = await _tenant_admin_indexes(db)
    return {
        **_enrich_invite_dict(invite, by_tenant, by_company),
        "tenant": tenant_dict,
        "resolvedProviderId": provider_id,
    }


@router.get("/invites")
async def list_invites(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(UserInvitation).order_by(UserInvitation.created_at.desc())
    )
    invites = result.scalars().all()
    by_tenant, by_company = await _tenant_admin_indexes(db)
    return [_enrich_invite_dict(i, by_tenant, by_company) for i in invites]


@router.get("/invites/tenant-companies")
async def list_tenant_companies(db: AsyncSession = Depends(get_db)):
    """Unique company names from active Tenant Admin invitations (for Tenant User dropdown)."""
    result = await db.execute(
        select(UserInvitation.company_name)
        .where(
            UserInvitation.role == "TENANT_ADMIN",
            UserInvitation.archived.is_(False),
            UserInvitation.decommissioned.is_(False),
        )
        .order_by(UserInvitation.company_name)
    )
    names = []
    seen = set()
    for (name,) in result.all():
        key = name.strip().lower()
        if key and key not in seen:
            seen.add(key)
            names.append(name.strip())
    return {"companies": names}


async def _get_invite(invite_id: str, db: AsyncSession) -> UserInvitation:
    invite = await db.get(UserInvitation, invite_id)
    if not invite:
        raise HTTPException(status_code=404, detail="Invitation not found")
    return invite


async def _archive_linked_tenant(db: AsyncSession, tenant_id: str | None, archive: bool):
    if not tenant_id:
        return None
    tenant = await db.get(Tenant, tenant_id)
    if not tenant:
        return None
    tenant.archived = archive
    tenant.status = "INACTIVE" if archive else "ACTIVE"
    return tenant.to_dict()


def _intake_snapshot(body: dict) -> dict:
    """Normalize registration intake fields into a stored JSON snapshot."""
    return {
        "full_name": str(body.get("full_name") or "").strip(),
        "org_name": str(body.get("org_name") or "").strip(),
        "contact_email": str(body.get("contact_email") or "").strip().lower(),
        "plan": body.get("plan") or "PROFESSIONAL",
        "primary_cloud": body.get("primary_cloud") or "azure",
        "compliance": body.get("compliance") or "HIPAA",
        "job_title": str(body.get("job_title") or "").strip(),
        "project": str(body.get("project") or "").strip(),
        "environment": body.get("environment") or "prod",
        "app_category": body.get("app_category") or "rag",
        "budget_ceiling": int(body.get("budget_ceiling") or 2000),
        "description": str(body.get("description") or "").strip(),
    }


DEFAULT_PROVIDER_USER_CAPS = {
    "view_providers_tenants": True,
    "view_llm_kit_progress": True,
    "view_portfolio_analytics": True,
    "view_optima_savings": True,
    "view_health_dashboards": True,
    "view_audit_readonly": True,
    "invite_users": False,
    "manage_tenants": False,
    "approve_costs": False,
    "submit_workflow": False,
}


def _provider_user_intake_snapshot(body: dict, invite: UserInvitation | None = None) -> dict:
    """Normalize Provider User registration intake. Capabilities are set by Provider Admin."""
    caps_in = body.get("capabilities") if isinstance(body.get("capabilities"), dict) else {}
    caps = {**DEFAULT_PROVIDER_USER_CAPS, **{k: bool(v) for k, v in caps_in.items()}}
    # Only known capability keys are persisted
    caps = {k: bool(caps.get(k, DEFAULT_PROVIDER_USER_CAPS.get(k, False))) for k in DEFAULT_PROVIDER_USER_CAPS}
    snapshot = {
        "full_name": str(body.get("full_name") or (invite.full_name if invite else "") or "").strip(),
        "org_name": str(body.get("org_name") or body.get("company_name") or (invite.company_name if invite else "") or "").strip(),
        "contact_email": str(body.get("contact_email") or body.get("email") or (invite.email if invite else "") or "").strip().lower(),
        "department": str(body.get("department") or (invite.department if invite else "") or "").strip(),
        "job_title": str(body.get("job_title") or (invite.job_title if invite else "") or "").strip(),
        "function_area": str(body.get("function_area") or (invite.function_area if invite else "") or "").strip(),
        "portfolio_scope": str(body.get("portfolio_scope") or "all_tenants").strip(),
        "contribution": str(body.get("contribution") or "").strip(),
        "capabilities": caps,
        "provider_notes": str(body.get("provider_notes") or "").strip(),
    }
    if body.get("capability_requests") is not None:
        snapshot["capability_requests"] = body.get("capability_requests") or []
    if body.get("request_note") is not None:
        snapshot["request_note"] = str(body.get("request_note") or "").strip()
    return snapshot


def _apply_provider_user_intake(invite: UserInvitation, body: dict) -> dict:
    snapshot = _provider_user_intake_snapshot(body, invite)
    if snapshot["full_name"]:
        invite.full_name = snapshot["full_name"]
    if snapshot["org_name"]:
        invite.company_name = snapshot["org_name"]
    if snapshot["contact_email"]:
        invite.email = snapshot["contact_email"]
    invite.department = snapshot["department"] or None
    invite.job_title = snapshot["job_title"] or None
    invite.function_area = snapshot["function_area"] or None
    invite.intake_data = snapshot
    if snapshot.get("provider_notes"):
        invite.provider_notes = snapshot["provider_notes"]
    return snapshot


def _tenant_user_intake_snapshot(body: dict, invite: UserInvitation) -> dict:
    """Normalize Tenant User requirement form for Provider Admin approval."""
    base = dict(invite.intake_data or {})
    return {
        "full_name": str(body.get("full_name") or base.get("full_name") or invite.full_name or "").strip(),
        "org_name": str(body.get("org_name") or body.get("company_name") or base.get("org_name") or invite.company_name or "").strip(),
        "contact_email": str(
            body.get("contact_email") or body.get("email") or base.get("contact_email") or invite.email or ""
        ).strip().lower(),
        "function_area": str(
            body.get("function_area") or base.get("function_area") or invite.function_area or ""
        ).strip(),
        "job_title": str(body.get("job_title") or base.get("job_title") or invite.job_title or "").strip(),
        "department": str(body.get("department") or base.get("department") or invite.department or "").strip(),
        "project": str(body.get("project") or base.get("project") or "").strip(),
        "environment": str(body.get("environment") or base.get("environment") or "prod").strip(),
        "access_scope": str(
            body.get("access_scope") or body.get("portfolio_scope") or base.get("access_scope") or "workflow"
        ).strip(),
        "primary_cloud": str(body.get("primary_cloud") or base.get("primary_cloud") or "azure").strip(),
        "compliance": str(body.get("compliance") or base.get("compliance") or "HIPAA").strip(),
        "description": str(
            body.get("description") or body.get("contribution") or base.get("description") or base.get("contribution") or ""
        ).strip(),
        "contribution": str(
            body.get("contribution") or body.get("description") or base.get("contribution") or base.get("description") or ""
        ).strip(),
        "invited_by": str(body.get("invited_by") or base.get("invited_by") or invite.invited_by or "Tenant Admin").strip(),
        "tenant_id": str(body.get("tenant_id") or base.get("tenant_id") or invite.tenant_id or "").strip() or None,
        "provider_notes": str(body.get("provider_notes") or "").strip(),
    }


def _apply_tenant_user_intake(invite: UserInvitation, body: dict) -> dict:
    snapshot = _tenant_user_intake_snapshot(body, invite)
    if snapshot["full_name"]:
        invite.full_name = snapshot["full_name"]
    if snapshot["org_name"]:
        invite.company_name = snapshot["org_name"]
    if snapshot["contact_email"]:
        invite.email = snapshot["contact_email"]
    invite.function_area = snapshot["function_area"] or None
    invite.job_title = snapshot["job_title"] or None
    invite.department = snapshot["department"] or None
    invite.intake_data = snapshot
    if snapshot.get("provider_notes"):
        invite.provider_notes = snapshot["provider_notes"]
        invite.review_message = snapshot["provider_notes"]
    return snapshot


async def _apply_intake_to_invite_and_tenant(
    invite: UserInvitation, body: dict, db: AsyncSession
) -> dict | None:
    """Apply intake fields onto invitation + linked tenant. Returns tenant dict if any."""
    snapshot = _intake_snapshot(body)
    if snapshot["full_name"]:
        invite.full_name = snapshot["full_name"]
    if snapshot["org_name"]:
        invite.company_name = snapshot["org_name"]
    if snapshot["contact_email"]:
        invite.email = snapshot["contact_email"]
    if snapshot["job_title"]:
        invite.job_title = snapshot["job_title"]

    invite.intake_data = snapshot

    tenant_dict = None
    if invite.tenant_id:
        tenant = await db.get(Tenant, invite.tenant_id)
        if tenant:
            if snapshot["org_name"]:
                tenant.org_name = snapshot["org_name"]
            if snapshot["contact_email"]:
                tenant.contact_email = snapshot["contact_email"]
            tenant.plan = snapshot["plan"]
            tenant.primary_cloud = snapshot["primary_cloud"]
            tenant.compliance = snapshot["compliance"]
            tenant.budget_ceiling = snapshot["budget_ceiling"]
            tenant.status = "ACTIVE"
            tenant.archived = False
            tenant_dict = tenant.to_dict()
    return tenant_dict


@router.get("/invite/{invite_id}")
async def get_invite(invite_id: str, db: AsyncSession = Depends(get_db)):
    invite = await _get_invite(invite_id, db)
    tenant_dict = None
    if invite.tenant_id:
        tenant = await db.get(Tenant, invite.tenant_id)
        if tenant:
            tenant_dict = tenant.to_dict()
    by_tenant, by_company = await _tenant_admin_indexes(db)
    return {**_enrich_invite_dict(invite, by_tenant, by_company), "tenant": tenant_dict}


@router.patch("/invite/{invite_id}/delete")
async def delete_invite(invite_id: str, db: AsyncSession = Depends(get_db)):
    """Soft-delete invitation → Archive. Linked tenant registration is archived too."""
    from datetime import datetime

    invite = await _get_invite(invite_id, db)
    invite.archived = True
    invite.decommissioned = False
    invite.archived_at = datetime.utcnow()
    tenant = await _archive_linked_tenant(db, invite.tenant_id, True)
    # Also archive other invites for the same tenant company under this provider
    if invite.tenant_id:
        siblings = await db.execute(
            select(UserInvitation).where(
                UserInvitation.tenant_id == invite.tenant_id,
                UserInvitation.id != invite.id,
            )
        )
        for sib in siblings.scalars().all():
            sib.archived = True
            sib.archived_at = datetime.utcnow()
    await db.commit()
    await db.refresh(invite)
    return {**invite.to_dict(), "tenant": tenant}


@router.patch("/invite/{invite_id}/decommission")
async def decommission_invite(invite_id: str, db: AsyncSession = Depends(get_db)):
    """Decommission invitation → Archive as decommissioned. Linked tenant inactivated."""
    from datetime import datetime

    invite = await _get_invite(invite_id, db)
    invite.archived = True
    invite.decommissioned = True
    invite.archived_at = datetime.utcnow()
    tenant = await _archive_linked_tenant(db, invite.tenant_id, True)
    await db.commit()
    await db.refresh(invite)
    return {**invite.to_dict(), "tenant": tenant}


@router.patch("/invite/{invite_id}/approve")
async def approve_invite(invite_id: str, payload: dict | None = None, db: AsyncSession = Depends(get_db)):
    """
    Approve a Tenant Admin (or other) invitation after requirement intake.
    Sets status to ACCEPTED (displayed as APPROVED) and persists intake JSON.
    """
    from datetime import datetime

    invite = await _get_invite(invite_id, db)
    if invite.archived or invite.decommissioned:
        raise HTTPException(status_code=400, detail="Cannot approve an archived invitation.")

    body = payload or {}
    if invite.role == "PROVIDER_USER":
        _apply_provider_user_intake(invite, body)
        invite.status = "ACCEPTED"
        invite.pending_intake_data = None
        invite.last_edited_by = body.get("actor") or "Provider"
        invite.last_reviewed_at = datetime.utcnow()
        dept = (invite.intake_data or {}).get("department") or invite.department
        await log_activity(
            db,
            kind="provision",
            from_role="Provider Admin",
            to_role="Provider User",
            from_name="Provider Admin",
            to_name=invite.full_name,
            message="Registered Provider User",
            detail=f"{invite.company_name}" + (f" · {dept}" if dept else "") + " · platform access granted",
            invite_id=invite.id,
            unread=True,
        )
        await db.commit()
        await db.refresh(invite)
        return {**invite.to_dict(), "tenant": None}

    if invite.role == "TENANT_USER":
        _apply_tenant_user_intake(invite, body)
        invite.status = "ACCEPTED"
        invite.pending_intake_data = None
        invite.last_edited_by = body.get("actor") or "Provider Admin"
        invite.last_reviewed_at = datetime.utcnow()
        invite.last_review_decision = "approve"
        if body.get("provider_notes"):
            invite.provider_notes = str(body["provider_notes"]).strip()
            invite.review_message = invite.provider_notes
        fn = (invite.intake_data or {}).get("function_area") or invite.function_area
        await log_activity(
            db,
            kind="approval",
            from_role="Provider Admin",
            to_role="Tenant User",
            from_name="Provider Admin",
            to_name=invite.full_name,
            message="Approved Tenant User profile",
            detail=f"{invite.company_name}" + (f" · {fn}" if fn else "") + " · invited by Tenant Admin",
            tenant_id=invite.tenant_id,
            invite_id=invite.id,
            unread=True,
        )
        await db.commit()
        await db.refresh(invite)
        tenant_dict = None
        if invite.tenant_id:
            tenant = await db.get(Tenant, invite.tenant_id)
            if tenant:
                tenant_dict = tenant.to_dict()
        return {**invite.to_dict(), "tenant": tenant_dict}

    tenant_dict = await _apply_intake_to_invite_and_tenant(invite, body, db)
    invite.status = "ACCEPTED"
    invite.pending_intake_data = None
    invite.last_edited_by = body.get("actor") or "Provider"
    invite.last_reviewed_at = datetime.utcnow()
    if body.get("provider_notes"):
        invite.provider_notes = str(body["provider_notes"]).strip()
        invite.review_message = invite.provider_notes

    budget = (invite.intake_data or {}).get("budget_ceiling") or 2000
    await log_activity(
        db,
        kind="provision",
        from_role="Provider Admin",
        to_role=_role_label(invite.role),
        from_name="Provider Admin",
        to_name=invite.full_name,
        message=f"{invite.company_name} tenant provisioned",
        detail=f"${budget}/mo budget ceiling",
        tenant_id=invite.tenant_id,
        invite_id=invite.id,
        unread=True,
    )

    await db.commit()
    await db.refresh(invite)
    return {**invite.to_dict(), "tenant": tenant_dict}


@router.patch("/invite/{invite_id}/provider-user")
async def update_provider_user_intake(
    invite_id: str, payload: dict | None = None, db: AsyncSession = Depends(get_db)
):
    """Update Provider User registration intake (Provider Admin). Status stays APPROVED."""
    from datetime import datetime

    invite = await _get_invite(invite_id, db)
    if invite.role != "PROVIDER_USER":
        raise HTTPException(status_code=400, detail="Only Provider User registrations can be updated here.")
    if invite.archived or invite.decommissioned:
        raise HTTPException(status_code=400, detail="Cannot update an archived Provider User.")

    body = payload or {}
    _apply_provider_user_intake(invite, body)
    invite.status = "ACCEPTED"
    invite.pending_intake_data = None
    invite.last_edited_by = "Provider"
    invite.last_reviewed_at = datetime.utcnow()
    invite.last_review_decision = "provider_edit"
    if body.get("provider_notes"):
        invite.review_message = str(body["provider_notes"]).strip()
    await db.commit()
    await db.refresh(invite)
    return {**invite.to_dict(), "tenant": None}


@router.patch("/invite/{invite_id}/capability-request")
async def request_provider_user_capabilities(
    invite_id: str, payload: dict | None = None, db: AsyncSession = Depends(get_db)
):
    """
    Provider User requests capability add / exclude.
    Queues pending_intake_data and sets status PENDING for Provider Admin review.
    """
    from datetime import datetime

    invite = await _get_invite(invite_id, db)
    if invite.role != "PROVIDER_USER":
        raise HTTPException(status_code=400, detail="Only Provider User capability requests are supported.")
    if invite.archived or invite.decommissioned:
        raise HTTPException(status_code=400, detail="Cannot request changes on an archived Provider User.")
    if not invite.intake_data:
        raise HTTPException(status_code=400, detail="Provider User must be registered before requesting capability changes.")

    body = payload or {}
    requested_caps = body.get("capabilities")
    if not isinstance(requested_caps, dict):
        raise HTTPException(status_code=400, detail="capabilities object is required.")

    base = dict(invite.intake_data)
    snapshot = _provider_user_intake_snapshot(
        {
            **base,
            "capabilities": requested_caps,
            "capability_requests": body.get("capability_requests") or [],
            "request_note": body.get("request_note") or "",
        },
        invite,
    )
    invite.pending_intake_data = snapshot
    invite.status = "PENDING"
    invite.last_edited_by = "Provider User"
    invite.last_review_decision = "pending"
    note = str(body.get("request_note") or "").strip()
    invite.review_message = (
        f"Notification: Provider User “{invite.full_name}” requested capability changes. "
        f"Awaiting Provider Admin approval."
        + (f" Note: {note}" if note else "")
    )
    reqs = body.get("capability_requests") or []
    detail = ", ".join(
        f"{r.get('action', 'change')} “{r.get('label') or r.get('key')}”"
        for r in reqs
        if isinstance(r, dict)
    ) or "capability changes"
    await log_activity(
        db,
        kind="capability",
        from_role="Provider User",
        to_role="Provider Admin",
        from_name=invite.full_name,
        to_name="Provider Admin",
        message="Requested capability add / exclude",
        detail=detail + (f" · {note}" if note else ""),
        invite_id=invite.id,
        unread=True,
    )
    await db.commit()
    await db.refresh(invite)
    return {**invite.to_dict(), "tenant": None, "queuedForReview": True}


@router.patch("/invite/{invite_id}/capability-review")
async def review_provider_user_capabilities(
    invite_id: str, payload: dict | None = None, db: AsyncSession = Depends(get_db)
):
    """
    Provider Admin approves or rejects a Provider User capability change request.
    - approve: apply pending capabilities, status APPROVED
    - reject: discard pending, keep previous capabilities, status APPROVED
    """
    from datetime import datetime

    invite = await _get_invite(invite_id, db)
    if invite.role != "PROVIDER_USER":
        raise HTTPException(status_code=400, detail="Only Provider User capability reviews are supported.")
    if invite.archived or invite.decommissioned:
        raise HTTPException(status_code=400, detail="Cannot review an archived Provider User.")

    body = payload or {}
    decision = str(body.get("decision") or "").strip().lower()
    notes = str(body.get("notes") or "").strip()

    if decision not in ("approve", "reject"):
        raise HTTPException(status_code=400, detail="decision must be 'approve' or 'reject'.")
    if not invite.pending_intake_data and decision == "approve":
        raise HTTPException(status_code=400, detail="No pending capability changes to approve.")

    if decision == "approve":
        pending = dict(invite.pending_intake_data or {})
        _apply_provider_user_intake(invite, pending)
        invite.pending_intake_data = None
        invite.status = "ACCEPTED"
        invite.provider_notes = notes or invite.provider_notes
        invite.review_message = (
            notes
            or "Provider Admin approved your capability changes. Updated access is now live."
        )
        invite.last_review_decision = "approve"
    else:
        invite.pending_intake_data = None
        invite.status = "ACCEPTED"
        invite.provider_notes = notes or invite.provider_notes
        invite.review_message = (
            notes
            or "Rejected by Provider Admin. Previous capabilities remain in effect."
        )
        if notes and "reject" not in notes.lower():
            invite.review_message = f"Rejected by Provider Admin. {notes}"
        invite.last_review_decision = "reject"

    invite.last_edited_by = "Provider"
    invite.last_reviewed_at = datetime.utcnow()
    await log_activity(
        db,
        kind="approval",
        from_role="Provider Admin",
        to_role="Provider User",
        from_name="Provider Admin",
        to_name=invite.full_name,
        message=(
            "Approved capability changes"
            if decision == "approve"
            else "Rejected capability changes"
        ),
        detail=notes or (
            "Updated access is now live"
            if decision == "approve"
            else "Previous capabilities remain in effect"
        ),
        invite_id=invite.id,
        unread=True,
    )
    await db.commit()
    await db.refresh(invite)
    return {**invite.to_dict(), "tenant": None, "decision": decision}


@router.patch("/invite/{invite_id}/submit-edit")
async def submit_invite_edit(invite_id: str, payload: dict | None = None, db: AsyncSession = Depends(get_db)):
    """
    Edit Tenant Admin registration intake.
    - Provider actor: apply immediately and keep APPROVED.
    - Tenant Admin actor: queue pending_intake_data and set status PENDING for Provider review.
    """
    from datetime import datetime

    invite = await _get_invite(invite_id, db)
    if invite.archived or invite.decommissioned:
        raise HTTPException(status_code=400, detail="Cannot edit an archived invitation.")
    if invite.role != "TENANT_ADMIN":
        raise HTTPException(status_code=400, detail="Only Tenant Admin registrations can be edited here.")

    body = payload or {}
    actor = str(body.get("actor") or "tenant_admin").strip().lower()
    snapshot = _intake_snapshot(body)

    if actor in ("provider", "provider_admin", "provider admin"):
        tenant_dict = await _apply_intake_to_invite_and_tenant(invite, body, db)
        invite.status = "ACCEPTED"
        invite.pending_intake_data = None
        invite.last_edited_by = "Provider"
        invite.last_reviewed_at = datetime.utcnow()
        if body.get("provider_notes"):
            invite.provider_notes = str(body["provider_notes"]).strip()
            invite.review_message = (
                f"Provider updated registration details.\n{invite.provider_notes}"
            )
        else:
            invite.review_message = "Provider updated registration details."
        invite.last_review_decision = "provider_edit"
        await db.commit()
        await db.refresh(invite)
        return {**invite.to_dict(), "tenant": tenant_dict, "queuedForReview": False}

    # Tenant Admin edit → Provider review queue
    if not invite.intake_data:
        # First-time save if somehow missing approved intake — keep baseline separate from pending
        # Use current invite fields as approved baseline before queuing the edit
        invite.intake_data = {
            "full_name": invite.full_name,
            "org_name": invite.company_name,
            "contact_email": invite.email,
            "plan": "PROFESSIONAL",
            "primary_cloud": "azure",
            "compliance": "HIPAA",
            "job_title": invite.job_title or "",
            "project": f"{invite.company_name} GenAI Platform",
            "environment": "prod",
            "app_category": "rag",
            "budget_ceiling": 2000,
            "description": "",
        }
    invite.pending_intake_data = snapshot
    invite.status = "PENDING"
    invite.last_edited_by = "Tenant Admin"
    invite.last_review_decision = "pending"
    invite.review_message = (
        f"Notification: Tenant Admin “{invite.full_name}” submitted registration changes "
        f"for {invite.company_name}. Awaiting Provider review."
    )
    await log_activity(
        db,
        kind="approval",
        from_role="Tenant Admin",
        to_role="Provider Admin",
        from_name=invite.full_name,
        to_name="Provider Admin",
        message="Submitted registration changes for review",
        detail=invite.company_name,
        tenant_id=invite.tenant_id,
        invite_id=invite.id,
        unread=True,
    )
    await db.commit()
    await db.refresh(invite)
    return {**invite.to_dict(), "tenant": None, "queuedForReview": True}


@router.patch("/invite/{invite_id}/review")
async def review_invite_edit(invite_id: str, payload: dict | None = None, db: AsyncSession = Depends(get_db)):
    """
    Provider reviews a Tenant Admin edit request, or rejects a Tenant User profile.
    - Tenant Admin approve: apply pending intake, status APPROVED
    - Tenant Admin reject: discard pending, keep previous intake, status APPROVED
    - Tenant User reject: mark profile rejected (stays out of approved roster)
    """
    from datetime import datetime

    invite = await _get_invite(invite_id, db)
    if invite.archived or invite.decommissioned:
        raise HTTPException(status_code=400, detail="Cannot review an archived invitation.")

    body = payload or {}
    decision = str(body.get("decision") or "").strip().lower()
    notes = str(body.get("notes") or body.get("provider_notes") or "").strip()

    if decision not in ("approve", "reject"):
        raise HTTPException(status_code=400, detail="decision must be 'approve' or 'reject'.")

    # Tenant User initial profile reject (approve uses PATCH /approve)
    if invite.role == "TENANT_USER":
        if decision == "approve":
            _apply_tenant_user_intake(invite, {**(invite.intake_data or {}), **body, "provider_notes": notes})
            invite.status = "ACCEPTED"
            invite.pending_intake_data = None
            invite.last_review_decision = "approve"
            invite.review_message = notes or "Provider Admin approved your Tenant User profile."
        else:
            invite.pending_intake_data = None
            invite.status = "PENDING"
            invite.last_review_decision = "reject"
            invite.provider_notes = notes or None
            invite.review_message = notes or "Rejected by Provider Admin. Ask Tenant Admin to invite again with corrected details."
            if notes and "reject" not in notes.lower():
                invite.review_message = f"Rejected by Provider Admin. {notes}"
        invite.last_edited_by = body.get("actor") or "Provider Admin"
        invite.last_reviewed_at = datetime.utcnow()
        await log_activity(
            db,
            kind="approval",
            from_role="Provider Admin",
            to_role="Tenant User",
            from_name="Provider Admin",
            to_name=invite.full_name,
            message=(
                "Approved Tenant User profile"
                if decision == "approve"
                else "Rejected Tenant User profile"
            ),
            detail=notes or invite.company_name,
            tenant_id=invite.tenant_id,
            invite_id=invite.id,
            unread=True,
        )
        await db.commit()
        await db.refresh(invite)
        return {**invite.to_dict(), "tenant": None, "decision": decision}

    if not invite.pending_intake_data and decision == "approve":
        raise HTTPException(status_code=400, detail="No pending Tenant Admin changes to approve.")

    tenant_dict = None
    if decision == "approve":
        tenant_dict = await _apply_intake_to_invite_and_tenant(
            invite, invite.pending_intake_data or {}, db
        )
        invite.pending_intake_data = None
        invite.status = "ACCEPTED"
        invite.provider_notes = notes or None
        invite.review_message = (
            notes
            or "Provider approved your registration changes. Updated details are now live."
        )
        invite.last_edited_by = "Provider"
        invite.last_review_decision = "approve"
    else:
        # Keep previous intake_data; clear pending; stay APPROVED
        invite.pending_intake_data = None
        invite.status = "ACCEPTED"
        invite.provider_notes = notes or None
        invite.review_message = (
            notes
            or "Rejected by Provider. Please continue with the previously approved information."
        )
        if notes and "reject" not in notes.lower():
            invite.review_message = f"Rejected by Provider. {notes}"
        invite.last_edited_by = "Provider"
        invite.last_review_decision = "reject"

    invite.last_reviewed_at = datetime.utcnow()
    await log_activity(
        db,
        kind="approval",
        from_role="Provider Admin",
        to_role="Tenant Admin",
        from_name="Provider Admin",
        to_name=invite.full_name,
        message=(
            "Approved Tenant Admin registration changes"
            if decision == "approve"
            else "Rejected Tenant Admin registration changes"
        ),
        detail=notes or invite.company_name,
        tenant_id=invite.tenant_id,
        invite_id=invite.id,
        unread=True,
    )
    await db.commit()
    await db.refresh(invite)
    return {**invite.to_dict(), "tenant": tenant_dict, "decision": decision}


@router.patch("/invite/{invite_id}/restore")
async def restore_invite(invite_id: str, db: AsyncSession = Depends(get_db)):
    """Restore archived invitation (and linked tenant) back to the main pending list."""
    invite = await _get_invite(invite_id, db)
    invite.archived = False
    invite.decommissioned = False
    invite.archived_at = None
    invite.status = "ACCEPTED" if (invite.role == "PROVIDER_USER" and invite.intake_data) else "PENDING"
    tenant = await _archive_linked_tenant(db, invite.tenant_id, False)
    await db.commit()
    await db.refresh(invite)
    return {**invite.to_dict(), "tenant": tenant}


@router.delete("/invite/{invite_id}/purge")
async def purge_invite(invite_id: str, db: AsyncSession = Depends(get_db)):
    """
    Permanently delete an invitation from PostgreSQL.
    Also removes the linked tenant registration when no other invites remain.
    This cannot be restored.
    """
    try:
        invite = await _get_invite(invite_id, db)
    except HTTPException:
        # Check by id directly
        res = await db.execute(select(UserInvitation).where(UserInvitation.id == invite_id))
        invite = res.scalar_one_or_none()

    if not invite:
        return {"deleted": True, "inviteId": invite_id, "note": "Invite not found or already deleted."}

    tenant_id = invite.tenant_id
    company = invite.company_name
    await db.delete(invite)
    await db.flush()

    tenant_deleted = False
    if tenant_id:
        remaining = await db.execute(
            select(UserInvitation).where(UserInvitation.tenant_id == tenant_id)
        )
        leftover = remaining.scalars().all()
        if not leftover:
            from app.models.workflow import IntakeForm, AIRecommendation, ResourcePlan, TerraformArtifact, DeploymentOutput
            from app.models.optima import OptimizationRecommendation, ApprovalRecord, SavingsRecord
            from app.models.activity import ActivityEvent
            await db.execute(sa_delete(OptimizationRecommendation).where(OptimizationRecommendation.tenant_id == tenant_id))
            await db.execute(sa_delete(ApprovalRecord).where(ApprovalRecord.tenant_id == tenant_id))
            await db.execute(sa_delete(SavingsRecord).where(SavingsRecord.tenant_id == tenant_id))
            await db.execute(sa_delete(DeploymentOutput).where(DeploymentOutput.tenant_id == tenant_id))
            await db.execute(sa_delete(TerraformArtifact).where(TerraformArtifact.tenant_id == tenant_id))
            await db.execute(sa_delete(ResourcePlan).where(ResourcePlan.tenant_id == tenant_id))
            await db.execute(sa_delete(AIRecommendation).where(AIRecommendation.tenant_id == tenant_id))
            await db.execute(sa_delete(IntakeForm).where(IntakeForm.tenant_id == tenant_id))
            await db.execute(sa_delete(ActivityEvent).where(ActivityEvent.tenant_id == tenant_id))
            tenant = await db.get(Tenant, tenant_id)
            if tenant:
                await db.delete(tenant)
                tenant_deleted = True

    await db.commit()
    return {
        "deleted": True,
        "inviteId": invite_id,
        "tenantId": tenant_id,
        "companyName": company,
        "tenantDeleted": tenant_deleted,
    }


@router.delete("/invites/purge-all-archived")
async def purge_all_archived_invites(db: AsyncSession = Depends(get_db)):
    """Permanently delete all archived and decommissioned invitations from PostgreSQL."""
    from app.models.workflow import IntakeForm, AIRecommendation, ResourcePlan, TerraformArtifact, DeploymentOutput
    from app.models.optima import OptimizationRecommendation, ApprovalRecord, SavingsRecord
    from app.models.activity import ActivityEvent

    archived_res = await db.execute(
        select(UserInvitation.tenant_id).where(
            (UserInvitation.archived == True) | (UserInvitation.decommissioned == True)
        )
    )
    archived_tenant_ids = [t for t in archived_res.scalars().all() if t]

    if archived_tenant_ids:
        await db.execute(sa_delete(OptimizationRecommendation).where(OptimizationRecommendation.tenant_id.in_(archived_tenant_ids)))
        await db.execute(sa_delete(ApprovalRecord).where(ApprovalRecord.tenant_id.in_(archived_tenant_ids)))
        await db.execute(sa_delete(SavingsRecord).where(SavingsRecord.tenant_id.in_(archived_tenant_ids)))
        await db.execute(sa_delete(DeploymentOutput).where(DeploymentOutput.tenant_id.in_(archived_tenant_ids)))
        await db.execute(sa_delete(TerraformArtifact).where(TerraformArtifact.tenant_id.in_(archived_tenant_ids)))
        await db.execute(sa_delete(ResourcePlan).where(ResourcePlan.tenant_id.in_(archived_tenant_ids)))
        await db.execute(sa_delete(AIRecommendation).where(AIRecommendation.tenant_id.in_(archived_tenant_ids)))
        await db.execute(sa_delete(IntakeForm).where(IntakeForm.tenant_id.in_(archived_tenant_ids)))
        await db.execute(sa_delete(ActivityEvent).where(ActivityEvent.tenant_id.in_(archived_tenant_ids)))

    result = await db.execute(
        sa_delete(UserInvitation).where(
            (UserInvitation.archived == True) | (UserInvitation.decommissioned == True)
        )
    )
    count = result.rowcount

    if archived_tenant_ids:
        await db.execute(sa_delete(Tenant).where(Tenant.id.in_(archived_tenant_ids)))

    await db.commit()
    return {"deletedCount": count}
