@echo off
echo ========================================================
echo   Launching Feuji-GENTERA Multi-Tenant AI Platform
echo ========================================================
echo.

cd /d "%~dp0"

echo [1/3] Starting Docker containers (PostgreSQL pgvector ^& Redis)...
docker-compose up -d postgres redis

echo.
echo [2/3] Starting FastAPI Backend Service on http://localhost:8050 ...
start "Feuji-GENTERA Backend API (Port 8050)" cmd /k "cd /d "%~dp0backend" && python -m uvicorn main:app --host 0.0.0.0 --port 8050"

echo.
echo [3/3] Starting Vite Frontend Application on http://localhost:3050 ...
start "Feuji-GENTERA Frontend UI (Port 3050)" cmd /k "cd /d "%~dp0frontend" && npm run dev -- --host 0.0.0.0 --port 3050"

echo.
echo ========================================================
echo   Application successfully launched!
echo.
echo   Frontend UI : http://localhost:3050
echo   Backend API : http://localhost:8050
echo   Swagger Docs: http://localhost:8050/docs
echo ========================================================
echo.
pause
