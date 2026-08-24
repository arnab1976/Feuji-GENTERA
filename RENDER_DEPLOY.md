# Render / Docker deploy notes (backend)
#
# Service settings (Render Dashboard → Feuji-GENTERA → Settings):
# 1. Runtime: Docker
# 2. Dockerfile Path: ./Dockerfile
# 3. Docker Build Context Directory: .   (repo root)
# 4. Docker Command: LEAVE EMPTY (important — overrides break $PORT / entrypoint)
# 5. Health Check Path: /health
#
# Environment (Render → Environment):
#   APP_ENV=production
#   DATABASE_URL=<Neon pooled or direct URL>
#     Example shape: postgresql://USER:PASSWORD@ep-xxxx.region.aws.neon.tech/neondb?sslmode=require
#     Do NOT use localhost / 127.0.0.1 / postgres — those only work in local Docker.
#     Copy from Neon Console → Connection Details → Connection string.
#     Backend auto-converts to asyncpg and maps sslmode → ssl=require.
#   REDIS_URL=<Redis URL — use rediss:// for TLS>
#   CORS_ORIGINS=*   OR   https://your-app.vercel.app
#   APP_SECRET_KEY=<long random>
#
# If logs show: Database initialization skipped ([Errno 111] Connection refused)
#   → DATABASE_URL is missing or still localhost. Set Neon URL, then redeploy.
#
# After push to main, open Logs and confirm lines:
#   [feuji] import OK: Feuji LLM Kit + OPTIMA-AI
#   [feuji] launching uvicorn on 0.0.0.0:<PORT>
# Then https://feuji-gentera.onrender.com/health → {"status":"healthy"}
