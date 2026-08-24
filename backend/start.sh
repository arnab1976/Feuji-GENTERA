#!/bin/sh
# Render / Docker entrypoint — always bind to $PORT, fail with clear logs
set -eu

PORT="${PORT:-8050}"
echo "[feuji] starting Feuji GENTERA backend"
echo "[feuji] pwd=$(pwd) PORT=${PORT} APP_ENV=${APP_ENV:-unset}"
echo "[feuji] python=$(python -V 2>&1)"
echo "[feuji] listing /app:"
ls -la

echo "[feuji] importing ASGI app..."
python - <<'PY'
import os, sys, traceback
print("[feuji] DATABASE_URL set=", bool(os.getenv("DATABASE_URL")))
print("[feuji] REDIS_URL set=", bool(os.getenv("REDIS_URL")))
print("[feuji] CORS_ORIGINS=", os.getenv("CORS_ORIGINS", "<default>"))
try:
    import main
    print("[feuji] import OK:", getattr(main.app, "title", main.app))
except Exception:
    traceback.print_exc()
    sys.exit(1)
PY

echo "[feuji] launching uvicorn on 0.0.0.0:${PORT}"
exec uvicorn main:app --host 0.0.0.0 --port "${PORT}" --proxy-headers --forwarded-allow-ips='*'
