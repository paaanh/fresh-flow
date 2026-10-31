from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.engine import make_url

from app.api.v1.router import router
from app.core.config import DEVELOPMENT_JWT_SECRETS, settings
from app.core.logging import configure_logging

configure_logging()


@asynccontextmanager
async def lifespan(_: FastAPI):
    if settings.environment == "production":
        if settings.jwt_secret in DEVELOPMENT_JWT_SECRETS or settings.jwt_secret.startswith("replace-"):
            raise RuntimeError("JWT_SECRET must be configured in production")
        database_url = make_url(settings.database_url)
        if database_url.get_backend_name() == "sqlite" or database_url.password in {"freshflow", "replace-with-a-local-mysql-password"}:
            raise RuntimeError("Production requires MySQL and a non-development database password")
    yield


app = FastAPI(title=settings.app_name, version="0.1.0", lifespan=lifespan)
app.mount("/media", StaticFiles(directory=Path(__file__).parent / "media"), name="media")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.exception_handler(Exception)
async def unexpected_error_handler(request: Request, exc: Exception):
    logging.getLogger("freshflow.api").exception("Unhandled API error", exc_info=exc)
    return JSONResponse(status_code=500, content={"detail": "Lỗi máy chủ không mong muốn"})


app.include_router(router, prefix=settings.api_v1_prefix)


@app.get("/")
def root():
    return {"name": settings.app_name, "docs": "/docs", "health": f"{settings.api_v1_prefix}/health"}
