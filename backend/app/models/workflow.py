"""Workflow models — LLM Kit Phase 1 stages 1-9."""
import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, Integer, Text, JSON, ForeignKey, Enum, Float
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class IntakeForm(Base):
    """Stage 1 — Project intake form submission."""
    __tablename__ = "intake_forms"

    id: Mapped[str] = mapped_column(String(32), primary_key=True,
                                    default=lambda: "INTAKE_" + uuid.uuid4().hex[:8].upper())
    tenant_id: Mapped[str] = mapped_column(String(32), ForeignKey("tenants.id"), nullable=False)
    project_name: Mapped[str] = mapped_column(String(200), nullable=False)
    cloud: Mapped[str] = mapped_column(String(10), nullable=False)
    app_category: Mapped[str] = mapped_column(String(50), nullable=False)
    environment: Mapped[str] = mapped_column(String(20), default="prod")
    compliance: Mapped[str] = mapped_column(String(20), default="HIPAA")
    budget_ceiling: Mapped[int] = mapped_column(Integer, default=2000)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(30), default="pending_approval")
    submitted_by: Mapped[str] = mapped_column(String(200), nullable=True)
    submitted_by_role: Mapped[str] = mapped_column(String(40), nullable=True)
    approved_by: Mapped[str] = mapped_column(String(200), nullable=True)
    approved_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    review_notes: Mapped[str] = mapped_column(Text, nullable=True)
    submitted_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    tenant: Mapped["Tenant"] = relationship("Tenant", back_populates="intake_forms")
    recommendations: Mapped[list["AIRecommendation"]] = relationship(
        "AIRecommendation", back_populates="intake_form"
    )


class AIRecommendation(Base):
    """Stage 2 — AI-generated infrastructure recommendation."""
    __tablename__ = "ai_recommendations"

    id: Mapped[str] = mapped_column(String(32), primary_key=True,
                                    default=lambda: "REC_" + uuid.uuid4().hex[:8].upper())
    intake_id: Mapped[str] = mapped_column(String(32), ForeignKey("intake_forms.id"), nullable=False)
    tenant_id: Mapped[str] = mapped_column(String(32), ForeignKey("tenants.id"), nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    resources: Mapped[dict] = mapped_column(JSON, nullable=False)   # list of resource objects
    compliance_notes: Mapped[str] = mapped_column(Text, nullable=True)
    opa_flags: Mapped[list] = mapped_column(JSON, nullable=True)
    total_monthly_cost: Mapped[int] = mapped_column(Integer, default=0)
    model_used: Mapped[str] = mapped_column(String(100), nullable=True)
    latency_ms: Mapped[int] = mapped_column(Integer, nullable=True)
    token_count: Mapped[int] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String(30), default="pending_review")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    intake_form: Mapped["IntakeForm"] = relationship("IntakeForm", back_populates="recommendations")


class ResourcePlan(Base):
    """Stage 3 — Cost-reviewed and approved resource plan."""
    __tablename__ = "resource_plans"

    id: Mapped[str] = mapped_column(String(32), primary_key=True,
                                    default=lambda: "PLAN_" + uuid.uuid4().hex[:8].upper())
    tenant_id: Mapped[str] = mapped_column(String(32), ForeignKey("tenants.id"), nullable=False)
    recommendation_id: Mapped[str] = mapped_column(String(32), ForeignKey("ai_recommendations.id"), nullable=False)
    resources: Mapped[dict] = mapped_column(JSON, nullable=False)   # edited resource list
    approved_total: Mapped[int] = mapped_column(Integer, nullable=False)
    budget_ceiling: Mapped[int] = mapped_column(Integer, nullable=False)
    requires_approval: Mapped[bool] = mapped_column(default=False)
    approved_by: Mapped[str] = mapped_column(String(200), nullable=True)
    approved_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class TerraformArtifact(Base):
    """Stage 4 — Generated and validated Terraform HCL artifact."""
    __tablename__ = "terraform_artifacts"

    id: Mapped[str] = mapped_column(String(32), primary_key=True,
                                    default=lambda: "TF_" + uuid.uuid4().hex[:8].upper())
    tenant_id: Mapped[str] = mapped_column(String(32), ForeignKey("tenants.id"), nullable=False)
    plan_id: Mapped[str] = mapped_column(String(32), ForeignKey("resource_plans.id"), nullable=False)
    s3_key: Mapped[str] = mapped_column(String(500), nullable=False)   # S3/Blob path
    main_tf: Mapped[str] = mapped_column(Text, nullable=True)
    variables_tf: Mapped[str] = mapped_column(Text, nullable=True)
    outputs_tf: Mapped[str] = mapped_column(Text, nullable=True)
    providers_tf: Mapped[str] = mapped_column(Text, nullable=True)
    validation_status: Mapped[str] = mapped_column(String(20), default="pending")  # PASSED, FAILED
    opa_scan_status: Mapped[str] = mapped_column(String(20), default="pending")    # CLEAN, VIOLATIONS
    tfsec_status: Mapped[str] = mapped_column(String(20), default="pending")
    generation_time_ms: Mapped[int] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class DeploymentOutput(Base):
    """Stage 5 — outputs.json from terraform apply. Used by Phase 2 OPTIMA-AI."""
    __tablename__ = "deployment_outputs"

    id: Mapped[str] = mapped_column(String(32), primary_key=True,
                                    default=lambda: "OUT_" + uuid.uuid4().hex[:8].upper())
    tenant_id: Mapped[str] = mapped_column(String(32), ForeignKey("tenants.id"), nullable=False)
    artifact_id: Mapped[str] = mapped_column(String(32), ForeignKey("terraform_artifacts.id"), nullable=False)
    # Key outputs from terraform apply
    postgresql_fqdn: Mapped[str] = mapped_column(String(300), nullable=True)
    aks_cluster_name: Mapped[str] = mapped_column(String(200), nullable=True)
    resource_group: Mapped[str] = mapped_column(String(200), nullable=True)
    openai_endpoint: Mapped[str] = mapped_column(String(500), nullable=True)
    key_vault_uri: Mapped[str] = mapped_column(String(500), nullable=True)
    vnet_id: Mapped[str] = mapped_column(String(500), nullable=True)
    raw_outputs: Mapped[dict] = mapped_column(JSON, nullable=True)   # full outputs.json
    resources_created: Mapped[int] = mapped_column(Integer, default=0)
    apply_duration_s: Mapped[int] = mapped_column(Integer, nullable=True)
    deployed_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
