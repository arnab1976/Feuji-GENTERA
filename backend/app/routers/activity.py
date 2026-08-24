"""Cross-role Activity Feed — GET /activity, mark read, create notification, delete."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, update, func, delete
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, Field
from app.database import get_db
from app.models.activity import ActivityEvent
from app.services.activity_service import log_activity

router = APIRouter()


class ActivityCreate(BaseModel):
    kind: str = "notification"
    from_role: str
    to_role: str
    from_name: str
    to_name: str
    message: str
    detail: str | None = None
    tenant_id: str | None = None


class ActivityBulkDelete(BaseModel):
    ids: list[str] = Field(default_factory=list, min_length=1)


ROLE_LABEL = {
    "PROVIDER_USER": "Provider User",
    "TENANT_ADMIN": "Tenant Admin",
    "TENANT_USER": "Tenant User",
}


async def _backfill_from_invites(db: AsyncSession):
    """Derive initial feed rows from prior invitation / registration activity."""
    from app.models.invitation import UserInvitation

    result = await db.execute(
        select(UserInvitation).order_by(UserInvitation.created_at.desc()).limit(100)
    )
    invites = result.scalars().all()
    for invite in invites:
        to_role = ROLE_LABEL.get(invite.role, invite.role)
        registered = bool(invite.intake_data) and invite.status == "ACCEPTED"
        pending = bool(invite.pending_intake_data) and invite.status == "PENDING"
        when = invite.created_at

        if invite.role == "PROVIDER_USER" and pending:
            db.add(ActivityEvent(
                kind="capability",
                from_role="Provider User",
                to_role="Provider Admin",
                from_name=invite.full_name,
                to_name="Provider Admin",
                message="Requested capability add / exclude",
                detail="awaiting Provider Admin approval",
                invite_id=invite.id,
                unread=True,
                created_at=when,
            ))
        elif invite.role == "TENANT_ADMIN" and pending:
            db.add(ActivityEvent(
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
                created_at=when,
            ))

        # Always record the original invitation
        db.add(ActivityEvent(
            kind="invite",
            from_role="Provider Admin",
            to_role=to_role,
            from_name=invite.invited_by or "Provider Admin",
            to_name=invite.full_name,
            message=f"Invited as {to_role}",
            detail=invite.company_name + (f" · {invite.department}" if invite.department else ""),
            tenant_id=invite.tenant_id,
            invite_id=invite.id,
            unread=False if registered else invite.status == "PENDING",
            created_at=when,
        ))

        if registered:
            detail = invite.company_name
            if invite.role == "TENANT_ADMIN" and isinstance(invite.intake_data, dict):
                budget = invite.intake_data.get("budget_ceiling") or 2000
                detail = f"{invite.company_name} · ${budget}/mo budget ceiling"
            elif invite.department:
                detail = f"{invite.company_name} · {invite.department}"
            db.add(ActivityEvent(
                kind="provision",
                from_role="Provider Admin",
                to_role=to_role,
                from_name="Provider Admin",
                to_name=invite.full_name,
                message=f"Registered {to_role}" if invite.role != "TENANT_USER" else f"Accepted {to_role}",
                detail=detail,
                tenant_id=invite.tenant_id,
                invite_id=invite.id,
                unread=False,
                created_at=invite.last_reviewed_at or when,
            ))

    await db.flush()


@router.get("/activity")
async def list_activity(limit: int = 100, db: AsyncSession = Depends(get_db)):
    total_existing = await db.execute(select(func.count()).select_from(ActivityEvent))
    if int(total_existing.scalar_one() or 0) == 0:
        await _backfill_from_invites(db)
        await db.commit()

    result = await db.execute(
        select(ActivityEvent)
        .order_by(ActivityEvent.created_at.desc())
        .limit(min(limit, 200))
    )
    events = result.scalars().all()
    unread = await db.execute(
        select(func.count()).select_from(ActivityEvent).where(ActivityEvent.unread.is_(True))
    )
    return {
        "events": [e.to_dict() for e in events],
        "unreadCount": int(unread.scalar_one() or 0),
        "total": len(events),
    }


@router.get("/activity/unread-count")
async def unread_count(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(func.count()).select_from(ActivityEvent).where(ActivityEvent.unread.is_(True))
    )
    return {"unreadCount": int(result.scalar_one() or 0)}


@router.patch("/activity/{event_id}/read")
async def mark_read(event_id: str, db: AsyncSession = Depends(get_db)):
    event = await db.get(ActivityEvent, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Activity event not found")
    event.unread = False
    await db.commit()
    await db.refresh(event)
    return event.to_dict()


@router.patch("/activity/read-all")
async def mark_all_read(db: AsyncSession = Depends(get_db)):
    await db.execute(update(ActivityEvent).where(ActivityEvent.unread.is_(True)).values(unread=False))
    await db.commit()
    return {"ok": True}


@router.post("/activity", status_code=201)
async def create_activity(payload: ActivityCreate, db: AsyncSession = Depends(get_db)):
    event = await log_activity(
        db,
        kind=payload.kind or "notification",
        from_role=payload.from_role,
        to_role=payload.to_role,
        from_name=payload.from_name,
        to_name=payload.to_name,
        message=payload.message,
        detail=payload.detail,
        tenant_id=payload.tenant_id,
        unread=True,
    )
    await db.commit()
    await db.refresh(event)
    return event.to_dict()


@router.delete("/activity/{event_id}")
async def delete_activity(event_id: str, db: AsyncSession = Depends(get_db)):
    event = await db.get(ActivityEvent, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Activity event not found")
    await db.delete(event)
    await db.commit()
    return {"ok": True, "deleted": 1, "ids": [event_id]}


@router.post("/activity/delete-bulk")
async def delete_activity_bulk(payload: ActivityBulkDelete, db: AsyncSession = Depends(get_db)):
    ids = [i.strip() for i in payload.ids if isinstance(i, str) and i.strip()]
    if not ids:
        raise HTTPException(status_code=400, detail="Provide at least one activity id to delete.")
    result = await db.execute(delete(ActivityEvent).where(ActivityEvent.id.in_(ids)))
    await db.commit()
    deleted = int(result.rowcount or 0)
    return {"ok": True, "deleted": deleted, "ids": ids}
