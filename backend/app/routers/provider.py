"""Provider Management — POST /provider/create, GET /provider/{id}"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, EmailStr, field_validator
from app.database import get_db
from app.models.provider import Provider, ProviderUser
from app.models.tenant import Tenant
from app.models.invitation import UserInvitation
from sqlalchemy import delete as sa_delete

router = APIRouter()


class ProviderCreate(BaseModel):
    name: str
    admin_email: EmailStr
    industry: str
    plan: str = "ENTERPRISE"

    @field_validator("admin_email")
    @classmethod
    def normalize_email(cls, v: str) -> str:
        return v.strip().lower()


@router.post("/provider/create", status_code=status.HTTP_201_CREATED)
async def create_provider(payload: ProviderCreate, db: AsyncSession = Depends(get_db)):
    """
    Register a new provider organisation and persist it to the database.
    Admin email must be unique across providers; organisation name may be shared.
    Automatically creates a default PROVIDER_ADMIN user.
    """
    email = payload.admin_email.strip().lower()

    existing = await db.execute(
        select(Provider).where(func.lower(Provider.admin_email) == email)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "A provider with this admin email already exists. "
                "Organisation names may be the same, but each admin email must be unique."
            ),
        )

    provider = Provider(
        name=payload.name.strip(),
        admin_email=email,
        industry=payload.industry,
        plan=payload.plan,
    )
    db.add(provider)
    await db.flush()

    # Auto-create default PROVIDER_ADMIN user
    admin_user = ProviderUser(
        provider_id=provider.id,
        email=email,
        role="PROVIDER_ADMIN",
    )
    db.add(admin_user)
    await db.commit()
    await db.refresh(provider)
    # Avoid async lazy-load on relationships in the response
    return {
        "providerId": provider.id,
        "name": provider.name,
        "adminEmail": provider.admin_email,
        "industry": provider.industry,
        "plan": provider.plan,
        "status": provider.status,
        "createdAt": provider.created_at.isoformat(),
        "tenants": [],
        "users": [admin_user.to_dict()],
    }


@router.get("/providers")
async def list_providers(db: AsyncSession = Depends(get_db)):
    """List registered providers for frontend store sync."""
    result = await db.execute(select(Provider).order_by(Provider.created_at.desc()))
    return [p.to_dict_safe() for p in result.scalars().all()]


@router.get("/provider/{provider_id}")
async def get_provider(provider_id: str, db: AsyncSession = Depends(get_db)):
    provider = await db.get(Provider, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")
    return provider.to_dict_safe()


from app.models.workflow import IntakeForm, AIRecommendation, ResourcePlan, TerraformArtifact, DeploymentOutput
from app.models.optima import OptimizationRecommendation, ApprovalRecord, SavingsRecord
from app.models.activity import ActivityEvent


@router.delete("/provider/{provider_id}")
async def delete_provider(provider_id: str, db: AsyncSession = Depends(get_db)):
    """
    Permanently delete a provider and ALL related workflow/optima/tenant/invitation/user records from PostgreSQL.
    Frees up the admin email for re-registration. This cannot be restored.
    """
    provider = await db.get(Provider, provider_id)
    if not provider:
        res = await db.execute(
            select(Provider).where(func.lower(Provider.id) == provider_id.strip().lower())
        )
        provider = res.scalar_one_or_none()

    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found in database.")

    name = provider.name
    admin_email = provider.admin_email.strip().lower()

    # Collect all associated tenant IDs
    tenant_ids: list[str] = []
    t_res = await db.execute(select(Tenant.id).where(Tenant.provider_id == provider.id))
    for tid in t_res.scalars().all():
        if tid and tid not in tenant_ids:
            tenant_ids.append(tid)

    inv_res = await db.execute(
        select(UserInvitation.tenant_id).where(
            (UserInvitation.provider_id == provider.id) |
            (func.lower(UserInvitation.email) == admin_email)
        )
    )
    for tid in inv_res.scalars().all():
        if tid and tid not in tenant_ids:
            tenant_ids.append(tid)

    # 1. Delete dependent workflow & OPTIMA child records for these tenant_ids
    if tenant_ids:
        await db.execute(sa_delete(OptimizationRecommendation).where(OptimizationRecommendation.tenant_id.in_(tenant_ids)))
        await db.execute(sa_delete(ApprovalRecord).where(ApprovalRecord.tenant_id.in_(tenant_ids)))
        await db.execute(sa_delete(SavingsRecord).where(SavingsRecord.tenant_id.in_(tenant_ids)))
        await db.execute(sa_delete(DeploymentOutput).where(DeploymentOutput.tenant_id.in_(tenant_ids)))
        await db.execute(sa_delete(TerraformArtifact).where(TerraformArtifact.tenant_id.in_(tenant_ids)))
        await db.execute(sa_delete(ResourcePlan).where(ResourcePlan.tenant_id.in_(tenant_ids)))
        await db.execute(sa_delete(AIRecommendation).where(AIRecommendation.tenant_id.in_(tenant_ids)))
        await db.execute(sa_delete(IntakeForm).where(IntakeForm.tenant_id.in_(tenant_ids)))
        await db.execute(sa_delete(ActivityEvent).where(ActivityEvent.tenant_id.in_(tenant_ids)))

    # 2. Delete invitations by provider_id, admin_email, or tenant_id
    if tenant_ids:
        await db.execute(
            sa_delete(UserInvitation).where(
                (UserInvitation.provider_id == provider.id) |
                (func.lower(UserInvitation.email) == admin_email) |
                (UserInvitation.tenant_id.in_(tenant_ids))
            )
        )
    else:
        await db.execute(
            sa_delete(UserInvitation).where(
                (UserInvitation.provider_id == provider.id) |
                (func.lower(UserInvitation.email) == admin_email)
            )
        )

    # 3. Delete tenants
    if tenant_ids:
        await db.execute(
            sa_delete(Tenant).where(
                (Tenant.provider_id == provider.id) | (Tenant.id.in_(tenant_ids))
            )
        )
    else:
        await db.execute(sa_delete(Tenant).where(Tenant.provider_id == provider.id))

    # 4. Delete provider users by provider_id OR admin_email
    await db.execute(
        sa_delete(ProviderUser).where(
            (ProviderUser.provider_id == provider.id) |
            (func.lower(ProviderUser.email) == admin_email)
        )
    )

    # 5. Delete provider itself
    await db.delete(provider)
    await db.commit()

    return {
        "deleted": True,
        "providerId": provider_id,
        "name": name,
        "adminEmail": admin_email,
        "tenantsPurged": len(tenant_ids),
    }
