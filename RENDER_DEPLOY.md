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
#   DATABASE_URL=<Neon connection string — postgresql:// is fine>
#   REDIS_URL=<Redis URL — use rediss:// for TLS>
#   CORS_ORIGINS=*   OR   https://your-app.vercel.app
#   APP_SECRET_KEY=<long random>
#
# After push to main, open Logs and confirm lines:
#   [feuji] import OK: Feuji LLM Kit + OPTIMA-AI
#   [feuji] launching uvicorn on 0.0.0.0:<PORT>
# Then https://feuji-gentera.onrender.com/health → {"status":"healthy"}
