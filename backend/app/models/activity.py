"""Cross-role activity feed events — persisted in PostgreSQL."""
import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, Boolean, Text
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class ActivityEvent(Base):
    __tablename__ = "activity_events"

    id: Mapped[str] = mapped_column(
        String(32),
        primary_key=True,
        default=lambda: "ACT_" + uuid.uuid4().hex[:10].upper(),
    )
    kind: Mapped[str] = mapped_column(String(40), nullable=False, default="invite")
    # invite | escalation | intake | provision | capability | approval | notification
    from_role: Mapped[str] = mapped_column(String(40), nullable=False)
    to_role: Mapped[str] = mapped_column(String(40), nullable=False)
    from_name: Mapped[str] = mapped_column(String(200), nullable=False)
    to_name: Mapped[str] = mapped_column(String(200), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    detail: Mapped[str | None] = mapped_column(Text, nullable=True)
    tenant_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    invite_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    unread: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    def to_dict(self):
        full_message = self.message
        if self.detail:
            full_message = f"{self.message} — {self.detail}"
        iso_time = (self.created_at if self.created_at else datetime.utcnow()).isoformat()
        return {
            "id": self.id,
            "kind": self.kind,
            "fromRole": self.from_role,
            "from_role": self.from_role,
            "toRole": self.to_role,
            "to_role": self.to_role,
            "fromName": self.from_name,
            "from_name": self.from_name,
            "toName": self.to_name,
            "to_name": self.to_name,
            "message": full_message,
            "detail": self.detail,
            "tenantId": self.tenant_id,
            "tenant_id": self.tenant_id,
            "inviteId": self.invite_id,
            "unread": bool(self.unread),
            "createdAt": iso_time,
            "created_at": iso_time,
        }
