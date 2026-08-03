-- Feuji LLM Kit — PostgreSQL initialization
-- Run automatically on first docker compose up via Docker entrypoint

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- pgvector: set IVFFlat probe count
-- OPTIMA-AI OPT-03 recommendation: reduce from 10 to 6
SET ivfflat.probes = 10;
