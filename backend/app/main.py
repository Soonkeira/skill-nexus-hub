import logging
import traceback

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.logging_config import configure_logging

configure_logging()

from app.middleware.rate_limit import RateLimitMiddleware

from app.api.admin import router as admin_router
from app.api.auth import router as auth_router
from app.api.bookmarks import router as bookmarks_router
from app.api.cli_download import router as cli_download_router
from app.api.collaborators import router as collaborators_router
from app.api.comments import router as comments_router
from app.api.feedback import router as feedback_router, admin_router as feedback_admin_router
from app.api.local_scan import router as local_scan_router
from app.api.llm_provider import router as llm_provider_router
from app.api.analysis import router as analysis_router
from app.api.analysis import admin_router as analysis_admin_router
from app.api.pending import router as pending_router
from app.api.skills import router as skills_router
from app.api.stats import router as stats_router
from app.api.tokens import router as tokens_router
from app.api.users import router as users_router
from app.api.versions import router as versions_router
from app.config import settings
from app.database import lifespan

logger = logging.getLogger(__name__)

app = FastAPI(title="Skill Nexus Hub", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)

app.add_middleware(RateLimitMiddleware)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    return response


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error("Unhandled exception on %s %s: %s\n%s", request.method, request.url.path, exc, traceback.format_exc())
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )


app.include_router(auth_router)
app.include_router(bookmarks_router)
app.include_router(skills_router)
app.include_router(feedback_router)
app.include_router(versions_router)
app.include_router(comments_router)
app.include_router(collaborators_router)
app.include_router(admin_router)
app.include_router(feedback_admin_router)
app.include_router(pending_router)
app.include_router(stats_router)
app.include_router(tokens_router)
app.include_router(cli_download_router)
app.include_router(local_scan_router)
app.include_router(llm_provider_router)
app.include_router(analysis_router)
app.include_router(analysis_admin_router)
app.include_router(users_router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}
