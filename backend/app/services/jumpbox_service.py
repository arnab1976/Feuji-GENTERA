"""
Stage 5 — Jump Box / Ephemeral Kubernetes Job Service.
One K8s Job per tenant per run. Container destroyed after apply.
Credentials exist in memory only — never written to disk.
"""
import asyncio
import uuid
from typing import AsyncGenerator
from app.config import settings


class JumpBoxService:
    async def create_k8s_job(self, tenant_id: str, artifact_id: str,
                              s3_key: str, action: str = "apply") -> str:
        """
        Creates an ephemeral Kubernetes Job in the tf-execution namespace.
        Job lifecycle:
          1. Download HCL from S3 (tenant-scoped prefix)
          2. Inject credentials from Secrets Manager in-memory
          3. terraform init
          4. terraform plan → websocket to UI
          5. terraform apply (if action == apply)
          6. Save outputs.json to S3
          7. Container self-destructs — credentials purged
        """
        job_id = f"tf-run-{tenant_id.lower()}-{uuid.uuid4().hex[:6]}"

        # In production: use kubernetes Python client to create Job manifest
        # k8s_client.create_namespaced_job("tf-execution", job_manifest)

        # Store job metadata in Redis for log streaming
        # await redis.set(f"job:{job_id}:status", "running", ex=3600)

        return job_id

    async def stream_logs(self, job_id: str) -> AsyncGenerator[str, None]:
        """
        Stream terraform apply logs from Redis pub/sub to WebSocket.
        NFR: < 3 second latency from terraform to browser.
        In production: subscribe to Redis channel job:{job_id}:logs
        """
        # Simulated log stream for demo/development
        demo_logs = [
            f"[1/6] K8s Job created: {job_id} in namespace tf-execution",
            "[2/6] Fetching credentials from Secrets Manager...",
            "      Credentials loaded to memory only — never written to disk",
            "[3/6] Downloading HCL artifact from S3...",
            "      terraform init — downloading providers...",
            "[4/6] Running terraform plan...",
            "      + azurerm_resource_group.main",
            "      + azurerm_virtual_network.main",
            "      + azurerm_postgresql_flexible_server.main",
            "      + azurerm_kubernetes_cluster.main",
            "      Plan: 34 resources to add, 0 to change, 0 to destroy.",
            "[5/6] Running terraform apply...",
            "      azurerm_resource_group.main: Creating...",
            "      azurerm_resource_group.main: Creation complete after 3s",
            "      azurerm_postgresql_flexible_server.main: Creating...",
            "      azurerm_kubernetes_cluster.main: Creating...",
            "      Apply complete! 34 added, 0 changed, 0 destroyed.",
            "[6/6] Saving outputs.json to S3... OK",
            "DONE  Container shutting down — credentials purged from memory.",
        ]
        for log in demo_logs:
            yield log
            await asyncio.sleep(0.3)
