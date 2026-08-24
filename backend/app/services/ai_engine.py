"""
Stage 2 — AI Recommendation Engine.
Supports Azure OpenAI (GPT-4o), AWS Bedrock (Claude 3 Sonnet), and GCP Vertex AI (Gemini).
Falls back to deterministic GCP/Azure/AWS blueprints when live cloud APIs are unavailable.
"""
import json
from typing import AsyncGenerator
from app.config import settings


SYSTEM_PROMPT = """You are the Feuji LLM Kit AI Recommendation Engine.
Given a project intake form, generate a JSON infrastructure recommendation with exactly this structure:
{
  "summary": "2-3 sentence plain-English description of the recommended architecture",
  "resources": [
    {
      "category": "Compute|Database|LLM Endpoint|Networking|Vector Store|Security|Observability",
      "resource": "specific SKU/service name",
      "justification": "why this resource, what it does, why this size",
      "monthly_cost": integer_usd
    }
  ],
  "compliance_notes": "how the architecture satisfies the compliance framework",
  "opa_flags": ["policy rule 1", "policy rule 2", ...]
}
Rules:
- Always include 7 resource categories
- Monthly costs must be realistic USD estimates
- For Azure: verify GPT-4o is available in the selected region (East US 2 is safe)
- For AWS: prefer Bedrock models in us-east-1 when HIPAA private networking is required
- For GCP: prefer Vertex AI Gemini in us-central1 with private Google Access; use GKE + Cloud SQL + pgvector
- For HIPAA: no public DB endpoints, all encryption at rest, private endpoints mandatory
- opa_flags must include specific policy constraints for the compliance framework
- Respond with ONLY the JSON object, no markdown, no preamble"""


def _deterministic_blueprint(form) -> dict:
    """Offline-safe recommendation tailored to intake cloud."""
    cloud = str(getattr(form, "cloud", "azure") or "azure").lower()
    app = str(getattr(form, "app_category", "rag") or "rag").lower()
    compliance = str(getattr(form, "compliance", "HIPAA") or "HIPAA")
    budget = int(getattr(form, "budget_ceiling", 2000) or 2000)
    project = getattr(form, "project_name", None) or getattr(form, "project", "Project")

    if cloud in ("gcp", "google"):
        resources = [
            {"category": "Compute", "resource": "GKE Autopilot (e2-standard-4 class, 2–6 nodes)", "justification": f"Scalable Kubernetes for {app} workloads", "monthly_cost": 155},
            {"category": "Database", "resource": "Cloud SQL PostgreSQL 15 + pgvector (HA)", "justification": "Managed SQL with vector search", "monthly_cost": 235},
            {"category": "LLM Endpoint", "resource": "Vertex AI Gemini 1.5 Pro (us-central1)", "justification": "GCP-native generative inference", "monthly_cost": 188},
            {"category": "Networking", "resource": "VPC + Cloud Load Balancing + Cloud Armor", "justification": "Private path + WAF edge", "monthly_cost": 64},
            {"category": "Vector Store", "resource": "pgvector on Cloud SQL (included)", "justification": "RAG embeddings co-located with DB", "monthly_cost": 0},
            {"category": "Security", "resource": "Secret Manager + Workload Identity", "justification": "Keyless pod identity & secrets", "monthly_cost": 29},
            {"category": "Observability", "resource": "Cloud Monitoring + Logging 90-day", "justification": "Ops telemetry retention", "monthly_cost": 24},
        ]
        summary = (
            f"GCP Vertex AI stack for {project}: GKE Autopilot, Cloud SQL + pgvector, "
            f"Gemini 1.5 Pro, Cloud Armor — sized under ~${budget}/mo with {compliance} private networking."
        )
    elif cloud == "aws":
        resources = [
            {"category": "Compute", "resource": "AWS EKS (m5.xlarge, 2–6 nodes)", "justification": "Managed Kubernetes", "monthly_cost": 160},
            {"category": "Database", "resource": "Aurora PostgreSQL + pgvector", "justification": "HA Postgres + vectors", "monthly_cost": 240},
            {"category": "LLM Endpoint", "resource": "Amazon Bedrock Claude 3 Sonnet", "justification": "Managed foundation model", "monthly_cost": 190},
            {"category": "Networking", "resource": "VPC + ALB + WAF", "justification": "Private subnets + edge WAF", "monthly_cost": 65},
            {"category": "Vector Store", "resource": "pgvector on Aurora (included)", "justification": "RAG store", "monthly_cost": 0},
            {"category": "Security", "resource": "KMS + IRSA", "justification": "Encryption + pod IAM", "monthly_cost": 30},
            {"category": "Observability", "resource": "CloudWatch 90-day", "justification": "Logs and metrics", "monthly_cost": 25},
        ]
        summary = f"AWS Bedrock stack for {project} under ~${budget}/mo ({compliance})."
    else:
        resources = [
            {"category": "Compute", "resource": "Azure AKS (Standard_D4s_v3, 2–6 nodes)", "justification": "Managed Kubernetes", "monthly_cost": 148},
            {"category": "Database", "resource": "PostgreSQL Flexible Server + pgvector", "justification": "Managed SQL + vectors", "monthly_cost": 225},
            {"category": "LLM Endpoint", "resource": "Azure OpenAI GPT-4o (private endpoint)", "justification": "Private Azure OpenAI", "monthly_cost": 185},
            {"category": "Networking", "resource": "VNet + Application Gateway WAF v2", "justification": "Private path + WAF", "monthly_cost": 62},
            {"category": "Vector Store", "resource": "pgvector on Flexible Server (included)", "justification": "RAG store", "monthly_cost": 0},
            {"category": "Security", "resource": "Key Vault + Managed Identity", "justification": "Secrets + workload identity", "monthly_cost": 28},
            {"category": "Observability", "resource": "Azure Monitor + Log Analytics 90-day", "justification": "Ops telemetry", "monthly_cost": 22},
        ]
        summary = f"Azure OpenAI stack for {project} under ~${budget}/mo ({compliance})."

    return {
        "summary": summary,
        "resources": resources,
        "compliance_notes": f"{compliance} baseline — private endpoints, encryption at rest, mandatory tags.",
        "opa_flags": [
            f"{compliance.lower()}-no-public-endpoint",
            "encryption-at-rest",
            "mandatory-tags-enforced",
            "private-subnet-delegation",
        ],
    }


class AIEngine:
    def __init__(self, cloud: str = "azure"):
        self.cloud = (cloud or "azure").lower()
        if self.cloud == "azure":
            self.model_name = settings.AZURE_OPENAI_DEPLOYMENT
        elif self.cloud in ("gcp", "google"):
            self.model_name = "vertex-ai-gemini-1.5-pro"
        else:
            self.model_name = settings.AWS_BEDROCK_MODEL_ID

    def _build_user_prompt(self, form) -> str:
        return json.dumps({
            "tenantId": form.tenant_id,
            "project": form.project_name,
            "cloud": form.cloud,
            "appCategory": form.app_category,
            "environment": form.environment,
            "compliance": form.compliance,
            "budgetCeiling": form.budget_ceiling,
            "description": form.description,
        }, indent=2)

    async def generate_recommendation(self, form) -> dict:
        """Non-streaming recommendation generation."""
        try:
            if self.cloud == "azure":
                return await self._azure_openai(form)
            if self.cloud in ("gcp", "google"):
                return await self._gcp_vertex(form)
            return await self._aws_bedrock(form)
        except Exception:
            return _deterministic_blueprint(form)

    async def stream_recommendation(self, form) -> AsyncGenerator[str, None]:
        """Streaming recommendation — yields text chunks for SSE."""
        try:
            if self.cloud == "azure":
                async for chunk in self._azure_stream(form):
                    yield chunk
                return
            if self.cloud in ("gcp", "google"):
                async for chunk in self._gcp_stream(form):
                    yield chunk
                return
            async for chunk in self._bedrock_stream(form):
                yield chunk
        except Exception:
            payload = json.dumps(_deterministic_blueprint(form))
            # Yield as small chunks for SSE clients
            step = max(40, len(payload) // 12)
            for i in range(0, len(payload), step):
                yield payload[i:i + step]

    async def _gcp_vertex(self, form) -> dict:
        """Prefer live Vertex when configured; otherwise deterministic GCP blueprint."""
        project = getattr(settings, "GCP_PROJECT_ID", None) or getattr(settings, "GOOGLE_CLOUD_PROJECT", None)
        if not project:
            return _deterministic_blueprint(form)
        try:
            import vertexai
            from vertexai.generative_models import GenerativeModel

            location = getattr(settings, "GCP_LOCATION", "us-central1")
            vertexai.init(project=project, location=location)
            model = GenerativeModel("gemini-1.5-pro")
            prompt = f"{SYSTEM_PROMPT}\n\nIntake:\n{self._build_user_prompt(form)}"
            resp = await model.generate_content_async(prompt)
            text = (resp.text or "").strip()
            if text.startswith("```"):
                text = text.strip("`").replace("json\n", "", 1)
            return json.loads(text)
        except Exception:
            return _deterministic_blueprint(form)

    async def _gcp_stream(self, form) -> AsyncGenerator[str, None]:
        payload = json.dumps(await self._gcp_vertex(form))
        step = max(40, len(payload) // 12)
        for i in range(0, len(payload), step):
            yield payload[i:i + step]

    async def _azure_openai(self, form) -> dict:
        from openai import AsyncAzureOpenAI
        client = AsyncAzureOpenAI(
            azure_endpoint=settings.AZURE_OPENAI_ENDPOINT,
            api_key=settings.AZURE_OPENAI_API_KEY,
            api_version=settings.AZURE_OPENAI_API_VERSION,
        )
        response = await client.chat.completions.create(
            model=settings.AZURE_OPENAI_DEPLOYMENT,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": self._build_user_prompt(form)},
            ],
            temperature=0.1,
            max_tokens=2000,
            response_format={"type": "json_object"},
        )
        return json.loads(response.choices[0].message.content)

    async def _azure_stream(self, form) -> AsyncGenerator[str, None]:
        from openai import AsyncAzureOpenAI
        client = AsyncAzureOpenAI(
            azure_endpoint=settings.AZURE_OPENAI_ENDPOINT,
            api_key=settings.AZURE_OPENAI_API_KEY,
            api_version=settings.AZURE_OPENAI_API_VERSION,
        )
        stream = await client.chat.completions.create(
            model=settings.AZURE_OPENAI_DEPLOYMENT,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": self._build_user_prompt(form)},
            ],
            stream=True, temperature=0.1, max_tokens=2000,
        )
        async for chunk in stream:
            if chunk.choices and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content

    async def _aws_bedrock(self, form) -> dict:
        import boto3
        client = boto3.client("bedrock-runtime", region_name=settings.AWS_DEFAULT_REGION)
        body = json.dumps({
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 2000,
            "system": SYSTEM_PROMPT,
            "messages": [{"role": "user", "content": self._build_user_prompt(form)}],
        })
        response = client.invoke_model(modelId=settings.AWS_BEDROCK_MODEL_ID, body=body)
        result = json.loads(response["body"].read())
        return json.loads(result["content"][0]["text"])

    async def _bedrock_stream(self, form) -> AsyncGenerator[str, None]:
        import boto3
        client = boto3.client("bedrock-runtime", region_name=settings.AWS_DEFAULT_REGION)
        body = json.dumps({
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 2000,
            "system": SYSTEM_PROMPT,
            "messages": [{"role": "user", "content": self._build_user_prompt(form)}],
        })
        response = client.invoke_model_with_response_stream(
            modelId=settings.AWS_BEDROCK_MODEL_ID, body=body
        )
        for event in response["body"]:
            chunk = json.loads(event["chunk"]["bytes"])
            if chunk.get("type") == "content_block_delta":
                yield chunk["delta"].get("text", "")
