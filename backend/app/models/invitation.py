"""User invitation model — invites created by Provider Admin."""
import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, Enum, ForeignKey, Boolean, JSON, Text
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class UserInvitation(Base):
    __tablename__ = "user_invitations"

    id: Mapped[str] = mapped_column(
        String(32),
        primary_key=True,
        default=lambda: "INV_" + uuid.uuid4().hex[:8].upper(),
    )
    full_name: Mapped[str] = mapped_column(String(200), nullable=False)
    email: Mapped[str] = mapped_column(String(200), nullable=False)
    role: Mapped[str] = mapped_column(
        Enum(
            "PROVIDER_USER",
            "TENANT_ADMIN",
            "TENANT_USER",
            name="invite_role_enum",
        ),
        nullable=False,
    )
    company_name: Mapped[str] = mapped_column(String(200), nullable=False)
    provider_id: Mapped[str | None] = mapped_column(
        String(32), ForeignKey("providers.id"), nullable=True
    )
    tenant_id: Mapped[str | None] = mapped_column(
        String(32), ForeignKey("tenants.id"), nullable=True
    )
    department: Mapped[str | None] = mapped_column(String(120), nullable=True)
    job_title: Mapped[str | None] = mapped_column(String(120), nullable=True)
    function_area: Mapped[str | None] = mapped_column(String(120), nullable=True)
    invited_by: Mapped[str] = mapped_column(String(120), default="Provider Admin")
    status: Mapped[str] = mapped_column(
        Enum("PENDING", "ACCEPTED", name="invite_status_enum"),
        default="PENDING",
    )
    archived: Mapped[bool] = mapped_column(Boolean, default=False)
    decommissioned: Mapped[bool] = mapped_column(Boolean, default=False)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Tenant Admin registration intake (approved / current)
    intake_data: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # Edits submitted by Tenant Admin awaiting Provider review
    pending_intake_data: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # Latest Provider notes (approve / reject messaging to Tenant Admin portal)
    provider_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    review_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_reviewed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_edited_by: Mapped[str | None] = mapped_column(String(40), nullable=True)
    last_review_decision: Mapped[str | None] = mapped_column(String(20), nullable=True)

    def to_dict(self):
        display_status = self.status
        if self.archived:
            display_status = "ARCHIVED"
        elif self.decommissioned:
            display_status = "DECOMMISSIONED"
        elif self.status == "ACCEPTED":
            display_status = "APPROVED"
        return {
            "inviteId": self.id,
            "fullName": self.full_name,
            "email": self.email,
            "role": self.role,
            "companyName": self.company_name,
            "providerId": self.provider_id,
            "tenantId": self.tenant_id,
            "tenantName": self.company_name if self.role != "PROVIDER_USER" else None,
            "department": self.department,
            "jobTitle": self.job_title,
            "functionArea": self.function_area,
            "invitedBy": self.invited_by,
            "invitedAt": self.created_at.isoformat() if self.created_at else None,
            "status": display_status,
            "archived": bool(self.archived),
            "decommissioned": bool(self.decommissioned),
            "archivedAt": self.archived_at.isoformat() if self.archived_at else None,
            "intakeData": self.intake_data,
            "pendingIntakeData": self.pending_intake_data,
            "providerNotes": self.provider_notes,
            "reviewMessage": self.review_message,
            "lastReviewedAt": self.last_reviewed_at.isoformat() if self.last_reviewed_at else None,
            "lastEditedBy": self.last_edited_by,
            "lastReviewDecision": self.last_review_decision,
            "hasPendingReview": bool(self.pending_intake_data) and self.status == "PENDING",
            "summaryLine": (
                f"{self.full_name} · {self.email} · {self.role.replace('_', ' ').title()} "
                f"· {self.company_name}"
                + (f" · {self.department}" if self.department else "")
                + f" · {display_status}"
            ),
        }
