"""
Seed script — creates a demo Provider + Tenant for local development.
Run: python scripts/create_demo_data.py
"""
import asyncio, httpx

BASE = "http://localhost:8050/api/v1"

async def seed():
    async with httpx.AsyncClient() as client:
        # Create Provider
        prov = await client.post(f"{BASE}/provider/create", json={
            "name": "Feuji Software Solutions",
            "admin_email": "arnab@feuji.com",
            "industry": "Technology & SaaS",
            "plan": "ENTERPRISE",
        })
        pid = prov.json()["providerId"]
        print(f"Provider: {pid}")

        # Register Tenant
        tenant = await client.post(f"{BASE}/tenant/register", json={
            "provider_id": pid,
            "org_name": "Innovate Health Corp",
            "contact_email": "admin@innovatehealth.com",
            "plan": "PROFESSIONAL",
            "primary_cloud": "azure",
            "compliance": "HIPAA",
            "budget_ceiling": 2000,
        })
        tid = tenant.json()["tenantId"]
        print(f"Tenant: {tid}")

        print("\nDemo data created. Open http://localhost:3050 to start the demo.")

asyncio.run(seed())
