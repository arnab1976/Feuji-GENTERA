# Feuji-GENTERA 1-Click Local Deployment Script
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  Launching Feuji-GENTERA Multi-Tenant AI Platform" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""

Set-Location -Path $PSScriptRoot

Write-Host "[1/3] Starting Docker containers (PostgreSQL pgvector & Redis)..." -ForegroundColor Yellow
docker-compose up -d postgres redis

Write-Host ""
Write-Host "[2/3] Launching FastAPI Backend on http://localhost:8050 ..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\backend'; python -m uvicorn main:app --host 0.0.0.0 --port 8050"

Write-Host ""
Write-Host "[3/3] Launching Vite Frontend on http://localhost:3050 ..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\frontend'; npm run dev -- --host 0.0.0.0 --port 3050"

Write-Host ""
Write-Host "========================================================" -ForegroundColor Green
Write-Host "  Application successfully deployed and running!" -ForegroundColor Green
Write-Host "  Frontend UI : http://localhost:3050" -ForegroundColor White
Write-Host "  Backend API : http://localhost:8050" -ForegroundColor White
Write-Host "  Swagger Docs: http://localhost:8050/docs" -ForegroundColor White
Write-Host "========================================================" -ForegroundColor Green
