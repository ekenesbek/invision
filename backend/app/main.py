"""FastAPI application entry point."""

import os
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

load_dotenv()

from .api.auth import auth_router, seed_user
from .api.candidates import candidates_router
from .api.config import config_router
from .api.demo import demo_router
from .api.routes import router
from .api.talents import talents_router
from .database import init_db, async_session


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    async with async_session() as db:
        await seed_user(db)
    # Load config from DB (API keys, model selection)
    from .api.config import ensure_loaded
    await ensure_loaded()
    # Pre-load ML model (non-blocking, lazy init on first call if fails)
    from .services import ml_detector
    if ml_detector.is_available():
        print("✅ InVisionEssayDetector ML model loaded")
    else:
        print("⚠️  ML model not available, using heuristic AI detection only")
    yield


app = FastAPI(
    title="inVision U AI Screening System",
    description="Интеллектуальная система поддержки отбора кандидатов в inVision U",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(router)
app.include_router(demo_router)
app.include_router(config_router)
app.include_router(candidates_router)
app.include_router(talents_router)


# Serve frontend static files (local dev: frontend/dist, Docker: /app/static)
_candidates = [
    Path(__file__).resolve().parent.parent.parent / "frontend" / "dist",
    Path("/app/static"),
]
FRONTEND_DIR = next((p for p in _candidates if p.exists()), _candidates[0])

if FRONTEND_DIR.exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIR / "assets"), name="static")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        file_path = FRONTEND_DIR / full_path
        if file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(FRONTEND_DIR / "index.html")
else:
    @app.get("/")
    async def root():
        return {
            "name": "inVision U AI Screening System",
            "version": "1.0.0",
            "docs": "/docs",
        }
