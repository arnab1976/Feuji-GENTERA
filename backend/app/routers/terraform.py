"""Stage 4 — Terraform HCL Generation Service"""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
import json
from app.database import get_db
from app.models.workflow import ResourcePlan, TerraformArtifact
from app.services.terraform_engine import TerraformEngine

router = APIRouter()

class TerraformGenRequest(BaseModel):
    plan_id: str
    tenant_id: str
    cloud: str    # azure | aws | gcp
    region: str = "eastus2"
    environment: str = "prod"
    stream: bool = True


class TerraformValidateRequest(BaseModel):
    cloud: str = "azure"
    region: str = "eastus2"
    environment: str = "prod"
    files: dict[str, str]


@router.post("/terraform/generate")
async def generate_terraform(payload: TerraformGenRequest, db: AsyncSession = Depends(get_db)):
    """
    Stage 4: LLM generates production-ready Terraform HCL (4 files).
    - main.tf: infrastructure blueprint
    - variables.tf: input parameter declarations
    - outputs.tf: connection details (feeds into outputs.json for RAG app + Phase 2 OPTIMA-AI)
    - providers.tf: cloud provider auth (IRSA for AWS, Workload Identity for Azure, WI for GCP)
    OPA, tfsec, and Checkov scans applied after generation.
    NFR: generation < 30 seconds.
    """
    plan = await db.get(ResourcePlan, payload.plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Resource plan not found")

    engine = TerraformEngine(cloud=payload.cloud, region=payload.region, env=payload.environment)

    if payload.stream:
        async def tf_stream():
            async for chunk in engine.stream_hcl(plan, payload.tenant_id):
                yield f"data: {json.dumps({'chunk': chunk})}\n\n"
            yield f"data: {json.dumps({'done': True})}\n\n"
        return StreamingResponse(tf_stream(), media_type="text/event-stream")

    hcl_files = await engine.generate_hcl(plan, payload.tenant_id)
    scan = await engine.full_compliance_scan(hcl_files, plan.resources)
    s3_key = f"tenants/{payload.tenant_id}/artifacts/{payload.plan_id}.zip"
    # In production: upload to S3/Blob here

    artifact = TerraformArtifact(
        tenant_id=payload.tenant_id, plan_id=payload.plan_id,
        s3_key=s3_key,
        main_tf=hcl_files.get("main.tf", ""),
        variables_tf=hcl_files.get("variables.tf", ""),
        outputs_tf=hcl_files.get("outputs.tf", ""),
        providers_tf=hcl_files.get("providers.tf", ""),
        validation_status="PASSED" if scan["validation"]["valid"] else "FAILED",
        opa_scan_status="CLEAN" if scan["opa"]["clean"] else "VIOLATIONS",
        tfsec_status=scan["tfsec"]["status"],
    )
    db.add(artifact)
    await db.commit()
    await db.refresh(artifact)
    return {
        "artifactId": artifact.id, "s3Key": s3_key,
        "files": list(hcl_files.keys()),
        "validationStatus": artifact.validation_status,
        "opaScan": artifact.opa_scan_status,
        "tfsec": artifact.tfsec_status,
        "scan": scan,
    }


@router.post("/terraform/validate")
async def validate_terraform(payload: TerraformValidateRequest):
    """
    Run terraform-style syntax validation + OPA + tfsec against posted HCL files.
    Offline — no cloud credentials required.
    """
    if not payload.files:
        raise HTTPException(status_code=400, detail="files map is required (main.tf, variables.tf, outputs.tf, providers.tf)")
    engine = TerraformEngine(cloud=payload.cloud, region=payload.region, env=payload.environment)
    return await engine.full_compliance_scan(payload.files)


@router.get("/terraform/artifact/{artifact_id}")
async def get_artifact(artifact_id: str, db: AsyncSession = Depends(get_db)):
    artifact = await db.get(TerraformArtifact, artifact_id)
    if not artifact:
        raise HTTPException(status_code=404, detail="Artifact not found")
    return {
        "artifactId": artifact.id,
        "files": {
            "main.tf": artifact.main_tf,
            "variables.tf": artifact.variables_tf,
            "outputs.tf": artifact.outputs_tf,
            "providers.tf": artifact.providers_tf,
        },
        "validationStatus": artifact.validation_status,
        "opaScan": artifact.opa_scan_status,
        "tfsec": artifact.tfsec_status,
    }
