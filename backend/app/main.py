"""FastAPI application entry point."""

import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

from .api.candidates import candidates_router
from .api.config import config_router
from .api.demo import demo_router
from .api.routes import router
from .database import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(
    title="inVision U AI Screening System",
    description="Интеллектуальная система поддержки отбора кандидатов в inVision U",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)
app.include_router(demo_router)
app.include_router(config_router)
app.include_router(candidates_router)


@app.get("/")
async def root():
    return {
        "name": "inVision U AI Screening System",
        "version": "1.0.0",
        "docs": "/docs",
    }
