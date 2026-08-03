"""Tenant Management — POST /tenant/register, PATCH /tenant/{id}/status"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, EmailStr
from datetime import datetime
from app.database import get_db
from app.models.tenant import Tenant

router = APIRouter()


@router.get("/tenants")
async def list_tenants(db: AsyncSession = Depends(get_db)):
    """List active (non-archived) tenants for Project Intake tenant scope."""
    result = await db.execute(
        select(Tenant)
        .where(Tenant.archived.is_(False))
        .order_by(Tenant.org_name)
    )
    return {"items": [t.to_dict() for t in result.scalars().all()]}


class TenantCreate(BaseModel):
    provider_id: str
    org_name: str
    contact_email: EmailStr
    plan: str = "PROFESSIONAL"
    primary_cloud: str = "azure"
    compliance: str = "HIPAA"
    budget_ceiling: int = 2000


class TenantStatusUpdate(BaseModel):
    status: str   # ACTIVE | INACTIVE


@router.post("/tenant/register", status_code=status.HTTP_201_CREATED)
async def register_tenant(payload: TenantCreate, db: AsyncSession = Depends(get_db)):
    """Register a new tenant under a provider. Tenant is immediately ACTIVE."""
    tenant = Tenant(
        provider_id=payload.provider_id,
        org_name=payload.org_name,
        contact_email=payload.contact_email,
        plan=payload.plan,
        primary_cloud=payload.primary_cloud,
        compliance=payload.compliance,
        budget_ceiling=payload.budget_ceiling,
    )
    db.add(tenant)
    await db.commit()
    await db.refresh(tenant)
    return tenant.to_dict()


@router.patch("/tenant/{tenant_id}/status")
async def update_tenant_status(
    tenant_id: str, payload: TenantStatusUpdate, db: AsyncSession = Depends(get_db)
):
    """Activate or deactivate a tenant."""
    tenant = await db.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    tenant.status = payload.status
    await db.commit()
    return {"tenantId": tenant_id, "status": tenant.status}


@router.get("/tenant/{tenant_id}")
async def get_tenant(tenant_id: str, db: AsyncSession = Depends(get_db)):
    tenant = await db.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return tenant.to_dict()
