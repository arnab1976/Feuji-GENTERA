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


@router.delete("/provider/{provider_id}")
async def delete_provider(provider_id: str, db: AsyncSession = Depends(get_db)):
    """
    Permanently delete a provider and related invitations / tenants / users.
    This cannot be restored.
    """
    provider = await db.get(Provider, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")

    name = provider.name

    # Invitations first (FK to tenants / providers)
    await db.execute(
        sa_delete(UserInvitation).where(UserInvitation.provider_id == provider_id)
    )
    # Tenants under this provider
    await db.execute(sa_delete(Tenant).where(Tenant.provider_id == provider_id))
    # Provider users
    await db.execute(
        sa_delete(ProviderUser).where(ProviderUser.provider_id == provider_id)
    )
    await db.delete(provider)
    await db.commit()

    return {
        "deleted": True,
        "providerId": provider_id,
        "name": name,
    }
