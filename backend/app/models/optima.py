"""
OPTIMA-AI Phase 2 models.
All records are scoped by tenant_id and linked to Phase 1 deployment_output_id.
Every OPTIMA-AI record is traceable back to a specific Phase 1 infrastructure deployment.
"""
import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, Integer, Text, JSON, ForeignKey, Enum, Float, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class OptimizationRecommendation(Base):
    """
    OPTIMA-AI recommendation derived from Phase 1 provisioned resources.
    Each record references the exact DeploymentOutput that produced the
    infrastructure being optimized.
    """
    __tablename__ = "optima_recommendations"

    id: Mapped[str] = mapped_column(
        String(32), primary_key=True,
        default=lambda: "OPT_" + uuid.uuid4().hex[:8].upper()
    )
    # Links back to Phase 1 ─────────────────────────────────────────────────
    tenant_id: Mapped[str] = mapped_column(String(32), ForeignKey("tenants.id"), nullable=False)
    deployment_output_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("deployment_outputs.id"), nullable=False,
        comment="Phase 1 deployment this recommendation is derived from"
    )
    # Recommendation metadata ────────────────────────────────────────────────
    rec_id: Mapped[str] = mapped_column(String(10), nullable=False)     # OPT-01, OPT-02 etc.
    lever: Mapped[str] = mapped_column(String(50), nullable=False)       # Cloud Compute, LLM Token Cost, etc.
    severity: Mapped[str] = mapped_column(
        Enum("HIGH", "MED", "LOW", name="sev_enum"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    detail: Mapped[str] = mapped_column(Text, nullable=False)
    # The exact resource from Phase 1 being optimized
    resource_name: Mapped[str] = mapped_column(String(300), nullable=True)
    resource_identifier: Mapped[str] = mapped_column(String(500), nullable=True)  # from outputs.json
    # Savings
    estimated_monthly_saving: Mapped[int] = mapped_column(Integer, nullable=False)  # USD
    effort: Mapped[str] = mapped_column(String(20), default="Low")
    risk: Mapped[str] = mapped_column(String(20), default="Low")
    action_description: Mapped[str] = mapped_column(Text, nullable=True)
    # Approval state
    status: Mapped[str] = mapped_column(
        Enum("pending", "approved", "rejected", "executed", name="optima_status_enum"),
        default="pending"
    )
    approved_by: Mapped[str] = mapped_column(String(200), nullable=True)
    approved_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    rejected_reason: Mapped[str] = mapped_column(Text, nullable=True)
    executed_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    # Phase 1 Terraform execution link — approved changes go back through Phase 1 pipeline
    tf_apply_job_id: Mapped[str] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    tenant: Mapped["Tenant"] = relationship("Tenant", back_populates="optima_recs")

    def to_dict(self):
        return {
            "id": self.id,
            "recId": self.rec_id,
            "lever": self.lever,
            "severity": self.severity,
            "title": self.title,
            "detail": self.detail,
            "resourceName": self.resource_name,
            "resourceIdentifier": self.resource_identifier,
            "estimatedMonthlySaving": self.estimated_monthly_saving,
            "effort": self.effort,
            "risk": self.risk,
            "actionDescription": self.action_description,
            "status": self.status,
            "approvedBy": self.approved_by,
            "approvedAt": self.approved_at.isoformat() if self.approved_at else None,
            "executedAt": self.executed_at.isoformat() if self.executed_at else None,
            "tfApplyJobId": self.tf_apply_job_id,
            "createdAt": self.created_at.isoformat(),
        }


class ApprovalRecord(Base):
    """Full audit trail for every approve/reject decision in OPTIMA-AI."""
    __tablename__ = "optima_approvals"

    id: Mapped[str] = mapped_column(String(32), primary_key=True,
                                    default=lambda: "APR_" + uuid.uuid4().hex[:8].upper())
    recommendation_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("optima_recommendations.id"), nullable=False
    )
    tenant_id: Mapped[str] = mapped_column(String(32), ForeignKey("tenants.id"), nullable=False)
    decision: Mapped[str] = mapped_column(Enum("approved", "rejected", name="decision_enum"), nullable=False)
    decided_by: Mapped[str] = mapped_column(String(200), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=True)
    decided_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class SavingsRecord(Base):
    """Monthly savings tracking — compares actuals against Phase 1 baseline cost."""
    __tablename__ = "optima_savings"

    id: Mapped[str] = mapped_column(String(32), primary_key=True,
                                    default=lambda: "SAV_" + uuid.uuid4().hex[:8].upper())
    tenant_id: Mapped[str] = mapped_column(String(32), ForeignKey("tenants.id"), nullable=False)
    deployment_output_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("deployment_outputs.id"), nullable=False
    )
    period_month: Mapped[str] = mapped_column(String(7), nullable=False)   # "2025-07"
    baseline_cost: Mapped[int] = mapped_column(Integer, nullable=False)    # Phase 1 Stage 3 approved cost
    projected_saving: Mapped[int] = mapped_column(Integer, default=0)
    realized_saving: Mapped[int] = mapped_column(Integer, default=0)
    cloud_bill_actual: Mapped[int] = mapped_column(Integer, nullable=True)  # reconciled cloud bill
    realization_rate: Mapped[float] = mapped_column(Float, nullable=True)   # realized / projected
    recorded_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
