"""Helpers to persist cross-role activity feed events."""
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.activity import ActivityEvent


async def log_activity(
    db: AsyncSession,
    *,
    kind: str,
    from_role: str,
    to_role: str,
    from_name: str,
    to_name: str,
    message: str,
    detail: str | None = None,
    tenant_id: str | None = None,
    invite_id: str | None = None,
    unread: bool = True,
) -> ActivityEvent:
    event = ActivityEvent(
        kind=kind,
        from_role=from_role,
        to_role=to_role,
        from_name=from_name,
        to_name=to_name,
        message=message,
        detail=detail,
        tenant_id=tenant_id,
        invite_id=invite_id,
        unread=unread,
    )
    db.add(event)
    await db.flush()
    return event
