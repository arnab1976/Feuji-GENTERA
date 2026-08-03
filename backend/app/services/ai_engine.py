"""
Stage 2 — AI Recommendation Engine.
Supports Azure OpenAI (GPT-4o) and AWS Bedrock (Claude 3 Sonnet).
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
- For HIPAA: no public DB endpoints, all encryption at rest, private endpoints mandatory
- opa_flags must include specific policy constraints for the compliance framework
- Respond with ONLY the JSON object, no markdown, no preamble"""


class AIEngine:
    def __init__(self, cloud: str = "azure"):
        self.cloud = cloud.lower()
        if self.cloud == "azure":
            self.model_name = settings.AZURE_OPENAI_DEPLOYMENT
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
        if self.cloud == "azure":
            return await self._azure_openai(form)
        return await self._aws_bedrock(form)

    async def stream_recommendation(self, form) -> AsyncGenerator[str, None]:
        """Streaming recommendation — yields text chunks for SSE."""
        if self.cloud == "azure":
            async for chunk in self._azure_stream(form):
                yield chunk
        else:
            async for chunk in self._bedrock_stream(form):
                yield chunk

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
