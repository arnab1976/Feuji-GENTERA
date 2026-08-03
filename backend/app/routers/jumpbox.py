"""Stage 5 — Execution Engine (Jump Box / Ephemeral K8s Job)"""
from fastapi import APIRouter, Depends, WebSocket, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
import asyncio, json
from app.database import get_db
from app.models.workflow import TerraformArtifact, DeploymentOutput
from app.services.jumpbox_service import JumpBoxService

router = APIRouter()

class ExecuteRequest(BaseModel):
    artifact_id: str
    tenant_id: str
    action: str = "apply"   # plan | apply | destroy

@router.post("/jumpbox/execute")
async def execute_terraform(payload: ExecuteRequest, db: AsyncSession = Depends(get_db)):
    """
    Stage 5: Creates an ephemeral Kubernetes Job that:
    1. Downloads HCL from S3 (tenant-scoped prefix)
    2. Injects cloud credentials in-memory from Secrets Manager
    3. Runs terraform init → plan → apply
    4. Saves outputs.json to S3
    5. Destroys container — credentials purged from memory
    Note: outputs.json from Step 4 is the PRIMARY input to Phase 2 OPTIMA-AI.
    """
    artifact = await db.get(TerraformArtifact, payload.artifact_id)
    if not artifact:
        raise HTTPException(status_code=404, detail="Artifact not found")

    service = JumpBoxService()
    job_id = await service.create_k8s_job(
        tenant_id=payload.tenant_id,
        artifact_id=payload.artifact_id,
        s3_key=artifact.s3_key,
        action=payload.action,
    )
    return {"jobId": job_id, "status": "running", "tenantId": payload.tenant_id}

@router.websocket("/jumpbox/logs/{job_id}")
async def stream_logs(websocket: WebSocket, job_id: str):
    """WebSocket endpoint — streams terraform apply logs to browser. NFR: < 3s latency."""
    await websocket.accept()
    service = JumpBoxService()
    try:
        async for log_line in service.stream_logs(job_id):
            await websocket.send_text(json.dumps({"log": log_line}))
    except Exception as e:
        await websocket.send_text(json.dumps({"error": str(e)}))
    finally:
        await websocket.close()

@router.get("/jumpbox/outputs/{tenant_id}")
async def get_deployment_outputs(tenant_id: str, db: AsyncSession = Depends(get_db)):
    """
    Returns the latest outputs.json for a tenant.
    This is consumed directly by Phase 2 OPTIMA-AI for cost analysis.
    """
    from sqlalchemy import select
    stmt = select(DeploymentOutput)\
        .where(DeploymentOutput.tenant_id == tenant_id)\
        .order_by(DeploymentOutput.deployed_at.desc())
    result = await db.execute(stmt)
    output = result.scalars().first()
    if not output:
        raise HTTPException(status_code=404, detail="No deployment outputs found. Run terraform apply first.")
    return output.raw_outputs or {
        "postgresql_fqdn": output.postgresql_fqdn,
        "aks_cluster_name": output.aks_cluster_name,
        "resource_group": output.resource_group,
        "openai_endpoint": output.openai_endpoint,
        "key_vault_uri": output.key_vault_uri,
    }
