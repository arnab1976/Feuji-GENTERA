"""Tenant model — enterprise customer, scoped under a Provider."""
import uuid
from datetime import datetime
from sqlalchemy import Boolean
from sqlalchemy import String, DateTime, Enum, ForeignKey, JSON, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Tenant(Base):
    __tablename__ = "tenants"

    id: Mapped[str] = mapped_column(String(32), primary_key=True,
                                    default=lambda: "TENANT_" + uuid.uuid4().hex[:8].upper())
    provider_id: Mapped[str] = mapped_column(String(32), ForeignKey("providers.id"), nullable=False)
    org_name: Mapped[str] = mapped_column(String(200), nullable=False)
    contact_email: Mapped[str] = mapped_column(String(200), nullable=False)
    plan: Mapped[str] = mapped_column(
        Enum("ENTERPRISE", "PROFESSIONAL", "FREE", name="tenant_plan_enum"),
        default="PROFESSIONAL"
    )
    primary_cloud: Mapped[str] = mapped_column(
        Enum("aws", "azure", "gcp", name="cloud_enum", create_constraint=False),
        default="azure"
    )
    compliance: Mapped[str] = mapped_column(
        Enum("HIPAA", "SOC2", "GDPR", "None", name="compliance_enum"),
        default="HIPAA"
    )
    status: Mapped[str] = mapped_column(
        Enum("ACTIVE", "INACTIVE", name="tenant_status_enum"),
        default="ACTIVE"
    )
    budget_ceiling: Mapped[int] = mapped_column(Integer, default=2000)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    archived: Mapped[bool] = mapped_column(Boolean, default=False)

    # Relationships
    provider: Mapped["Provider"] = relationship("Provider", back_populates="tenants")
    intake_forms: Mapped[list["IntakeForm"]] = relationship("IntakeForm", back_populates="tenant")
    optima_recs: Mapped[list["OptimizationRecommendation"]] = relationship(
        "OptimizationRecommendation", back_populates="tenant"
    )

    def to_dict(self):
        return {
            "tenantId": self.id,
            "providerId": self.provider_id,
            "orgName": self.org_name,
            "contact": self.contact_email,
            "billing": {"plan": self.plan, "currency": "USD"},
            "cloud": {"primary": self.primary_cloud},
            "compliance": self.compliance,
            "status": self.status,
            "budgetCeiling": self.budget_ceiling,
            "createdAt": self.created_at.isoformat(),
            "archived": bool(getattr(self, "archived", False)),
        }
