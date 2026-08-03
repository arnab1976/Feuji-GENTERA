# Feuji LLM Kit + OPTIMA-AI

## AI-Powered GenAI Infrastructure Provisioning & FinOps Platform

Built on **Solace Agent Mesh** · Phase 1: LLM Kit · Phase 2: OPTIMA-AI GenAI FinOps

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    FEUJI PLATFORM                               │
│                                                                 │
│  ┌─────────────────────────┐  ┌─────────────────────────────┐  │
│  │   PHASE 1 — LLM KIT    │  │  PHASE 2 — OPTIMA-AI        │  │
│  │                         │  │  (derives from Phase 1)     │  │
│  │  Admin & Tenant Model   │  │                             │  │
│  │  9 Workflow Stages:     │  │  1. FinOps Overview         │  │
│  │  1. Intake Form         │  │  2. Cost Breakdown          │  │
│  │  2. AI Recommendation   │  │  3. Recommendations         │  │
│  │  3. Cost & Review       │──┤  4. Approval Workflow       │  │
│  │  4. Terraform Gen       │  │  5. Savings Dashboard       │  │
│  │  5. Execution Engine    │  │                             │  │
│  │  6. Health Dashboard    │  │  Reads: ST.outputs,         │  │
│  │  7. Audit & Compliance  │  │  ST.rec, ST.aTotal,         │  │
│  │  8. Testing & QA        │  │  ST.at, ST.if               │  │
│  │  9. Launch & Ops        │  │                             │  │
│  └─────────────────────────┘  └─────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Project Structure

```
feuji-llm-kit/
├── backend/                     # FastAPI Python backend
│   ├── app/
│   │   ├── models/              # SQLAlchemy database models
│   │   ├── routers/             # API route handlers
│   │   ├── services/            # Business logic layer
│   │   └── middleware/          # Auth, logging, CORS
│   ├── main.py                  # FastAPI application entry
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/                    # React 18 + TypeScript
│   ├── src/
│   │   ├── components/
│   │   │   ├── layout/          # Topbar, Sidebar, MainContent
│   │   │   ├── admin/           # Provider, Tenant, RBAC screens
│   │   │   ├── workflow/        # Stages 1-9 components
│   │   │   └── optima/          # Phase 2 OPTIMA-AI screens
│   │   ├── store/               # Zustand global state
│   │   ├── services/            # API client services
│   │   ├── types/               # TypeScript interfaces
│   │   └── hooks/               # Custom React hooks
│   ├── package.json
│   └── Dockerfile
├── infrastructure/              # Terraform HCL
│   ├── main.tf                  # Tenant infrastructure blueprint
│   ├── variables.tf
│   ├── outputs.tf
│   ├── providers.tf
│   └── modules/                 # Reusable Terraform modules
├── k8s/                         # Kubernetes manifests
├── .github/workflows/           # CI/CD pipelines
├── scripts/                     # Utility scripts
└── docker-compose.yml           # Local development stack
```

## Quick Start

### Prerequisites
- Python 3.11+
- Node.js 20+
- Docker & Docker Compose
- PostgreSQL 15
- Redis 7

### Local Development

```bash
# 1. Clone and setup environment
git clone https://github.com/feuji/llm-kit.git
cd llm-kit
cp .env.example .env
# Edit .env with your cloud credentials and API keys

# 2. Start all services with Docker Compose
docker compose up -d

# 3. Backend only (for development)
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8050

# 4. Frontend only (for development)
cd frontend
npm install
npm run dev
```

The portal will be available at:
- **Frontend**: http://localhost:3050
- **Backend API**: http://localhost:8050
- **API Docs (Swagger)**: http://localhost:8050/docs

## Environment Variables

See `.env.example` for all required variables.

## Phase 1 — LLM Kit Workflow

| Stage | Name | Owner |
|-------|------|-------|
| 1 | Project Intake Form | Vyshnavi (FE) |
| 2 | AI Recommendation Engine | Vyshnavi Badeti |
| 3 | Cost Estimation & Review | Sunith + Vaishnavi |
| 4 | Terraform HCL Generation | Vaishnavi + Sunith |
| 5 | Execution Engine (Jump Box) | Vaishnavi + Sunith |
| 6 | Infrastructure Health Dashboard | TBD |
| 7 | Audit & Compliance (Phase 2) | Sunith |
| 8 | Integration Testing & QA | QA Engineer (TBD) |
| 9 | Production Launch & Ops | All teams |

## Phase 2 — OPTIMA-AI

OPTIMA-AI (Optimization Platform for Tokens, Infrastructure, Models and Applications) derives all its analysis from Phase 1 provisioned infrastructure. It never operates independently.

**Key principle:** OPTIMA-AI recommends. Humans approve. No automatic changes.

## License

Confidential — Feuji Software Solutions. Internal use only.
