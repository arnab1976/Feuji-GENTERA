"""
Feuji LLM Kit + OPTIMA-AI — FastAPI Application Entry Point
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from app.config import settings
from app.database import init_db
from app.routers import provider, tenant, invite, intake, ai, cost, terraform, jumpbox, health, audit, testing, optima, activity
from app.middleware.logging import LoggingMiddleware


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup — connect to DATABASE_URL (must be Neon/cloud on Render, not localhost)
    try:
        from urllib.parse import urlparse
        raw = settings.async_database_url
        parsed = urlparse(raw.replace("postgresql+asyncpg://", "postgresql://", 1))
        host = parsed.hostname or "?"
        print(f"[feuji] Connecting to database host={host} port={parsed.port or 5432} ...")
        if host in ("localhost", "127.0.0.1", "postgres"):
            print(
                "[feuji] WARNING: DATABASE_URL points at a local Docker host. "
                "On Render set Environment → DATABASE_URL to your Neon connection string."
            )
        await init_db()
        print(f"[feuji] Database ready (host={host})")
    except Exception as e:
        print(f"Warning: Database initialization skipped ({e}). Running in API standalone mode.")
        print(
            "[feuji] Fix: Render Dashboard → Environment → set DATABASE_URL to Neon "
            "(postgresql://...@....neon.tech/...?sslmode=require). Then Manual Deploy → Clear build cache & deploy."
        )
    yield
    # Shutdown — cleanup if needed


app = FastAPI(
    title="Feuji LLM Kit + OPTIMA-AI",
    description="AI-Powered GenAI Infrastructure Provisioning & FinOps Platform",
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# ── Middleware ────────────────────────────────────────────────────────────────
app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(LoggingMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allow_origins,
    allow_credentials=settings.cors_allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Phase 1 — LLM Kit Routers ────────────────────────────────────────────────
app.include_router(provider.router,  prefix="/api/v1", tags=["Provider Management"])
app.include_router(tenant.router,    prefix="/api/v1", tags=["Tenant Management"])
app.include_router(invite.router,    prefix="/api/v1", tags=["User Invitations"])
app.include_router(activity.router,  prefix="/api/v1", tags=["Cross-Role Activity Feed"])
app.include_router(intake.router,    prefix="/api/v1", tags=["Stage 1 — Intake"])
app.include_router(ai.router,        prefix="/api/v1", tags=["Stage 2 — AI Recommendation"])
app.include_router(cost.router,      prefix="/api/v1", tags=["Stage 3 — Cost Review"])
app.include_router(terraform.router, prefix="/api/v1", tags=["Stage 4 — Terraform Generation"])
app.include_router(jumpbox.router,   prefix="/api/v1", tags=["Stage 5 — Execution Engine"])
app.include_router(health.router,    prefix="/api/v1", tags=["Stage 6 — Health Dashboard"])
app.include_router(audit.router,     prefix="/api/v1", tags=["Stage 7 — Audit & Compliance"])
app.include_router(testing.router,   prefix="/api/v1", tags=["Stage 8 — Testing & QA"])

# ── Phase 2 — OPTIMA-AI Routers ──────────────────────────────────────────────
app.include_router(optima.router,    prefix="/api/v2/optima", tags=["Phase 2 — OPTIMA-AI FinOps"])


@app.get("/", tags=["Health"])
async def root():
    return {
        "service": "Feuji LLM Kit + OPTIMA-AI",
        "version": "2.0.0",
        "phase1": "LLM Kit — 9 Workflow Stages",
        "phase2": "OPTIMA-AI — GenAI FinOps",
        "status": "running",
    }


@app.get("/health", tags=["Health"])
async def health_check():
    return {"status": "healthy"}
