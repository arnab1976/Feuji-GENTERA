"""Request/response structured logging middleware."""
import time, structlog
from starlette.middleware.base import BaseHTTPMiddleware

logger = structlog.get_logger()

class LoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        t0 = time.time()
        response = await call_next(request)
        logger.info("request", method=request.method, path=request.url.path,
                    status=response.status_code, ms=round((time.time()-t0)*1000))
        return response
