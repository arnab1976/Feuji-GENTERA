"""Provider model — top-level platform owner."""
import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, Enum, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Provider(Base):
    __tablename__ = "providers"

    id: Mapped[str] = mapped_column(String(32), primary_key=True,
                                    default=lambda: "PROV_" + uuid.uuid4().hex[:8].upper())
    # Organisation name may be shared across providers; admin email must be unique.
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    admin_email: Mapped[str] = mapped_column(String(200), nullable=False, unique=True)
    industry: Mapped[str] = mapped_column(String(100), nullable=False)
    plan: Mapped[str] = mapped_column(
        Enum("ENTERPRISE", "PROFESSIONAL", "STARTER", name="plan_enum"),
        default="ENTERPRISE"
    )
    status: Mapped[str] = mapped_column(
        Enum("ACTIVE", "INACTIVE", name="provider_status_enum"),
        default="ACTIVE"
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    users: Mapped[list["ProviderUser"]] = relationship("ProviderUser", back_populates="provider", cascade="all, delete-orphan")
    tenants: Mapped[list["Tenant"]] = relationship("Tenant", back_populates="provider")

    def to_dict(self):
        return {
            "providerId": self.id,
            "name": self.name,
            "adminEmail": self.admin_email,
            "industry": self.industry,
            "plan": self.plan,
            "status": self.status,
            "createdAt": self.created_at.isoformat(),
            "tenants": [t.id for t in self.tenants],
            "users": [u.to_dict() for u in self.users],
        }

    def to_dict_safe(self):
        """Avoid async lazy-load issues for list endpoints."""
        return {
            "providerId": self.id,
            "name": self.name,
            "adminEmail": self.admin_email,
            "industry": self.industry,
            "plan": self.plan,
            "status": self.status,
            "createdAt": self.created_at.isoformat() if self.created_at else None,
            "tenants": [],
            "users": [],
        }


class ProviderUser(Base):
    __tablename__ = "provider_users"

    id: Mapped[str] = mapped_column(String(32), primary_key=True,
                                    default=lambda: "USER_" + uuid.uuid4().hex[:8].upper())
    provider_id: Mapped[str] = mapped_column(String(32), ForeignKey("providers.id"), nullable=False)
    email: Mapped[str] = mapped_column(String(200), nullable=False)
    role: Mapped[str] = mapped_column(
        Enum("PROVIDER_ADMIN", "PROVIDER_USER", "TENANT_ADMIN", "TENANT_USER", name="role_enum"),
        default="PROVIDER_ADMIN"
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    provider: Mapped["Provider"] = relationship("Provider", back_populates="users")

    def to_dict(self):
        return {"userId": self.id, "email": self.email, "role": self.role}
