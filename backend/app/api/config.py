"""Runtime configuration — API key and model selection."""

from __future__ import annotations

import os

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import select

from ..database import async_session
from ..models.db_models import AppSettingDB

config_router = APIRouter(prefix="/api/config", tags=["config"])

# In-memory cache (loaded from DB on first access)
_config: dict = {
    "openai_api_key": "",
    "model": "gpt-5.4-mini",
}
_loaded_from_db = False


class ConfigUpdate(BaseModel):
    openai_api_key: str = ""
    model: str = "gpt-5.4-mini"


class ConfigResponse(BaseModel):
    has_api_key: bool
    masked_key: str = ""
    model: str
    available_models: list[str]


AVAILABLE_MODELS = [
    "gpt-5.4",
    "gpt-5.4-mini",
    "gpt-5.4-nano",
]


async def _load_from_db():
    """Load persisted settings from database."""
    global _loaded_from_db
    if _loaded_from_db:
        return
    try:
        async with async_session() as session:
            result = await session.execute(
                select(AppSettingDB).where(AppSettingDB.key.in_(["openai_api_key", "model"]))
            )
            for row in result.scalars():
                if row.value:
                    _config[row.key] = row.value
        _loaded_from_db = True
    except Exception:
        # Table might not exist yet on first run
        _loaded_from_db = True


async def _save_setting(key: str, value: str):
    """Persist a setting to the database."""
    try:
        async with async_session() as session:
            existing = await session.get(AppSettingDB, key)
            if existing:
                existing.value = value
            else:
                session.add(AppSettingDB(key=key, value=value))
            await session.commit()
    except Exception:
        pass  # Non-critical — still works from memory


async def ensure_loaded():
    """Ensure config is loaded from DB. Call from any async endpoint."""
    await _load_from_db()


def get_config() -> dict:
    """Get current config. Falls back to env var for API key."""
    key = _config.get("openai_api_key") or os.getenv("OPENAI_API_KEY", "")
    return {
        "openai_api_key": key,
        "model": _config.get("model", "gpt-5.4-mini"),
    }


def _mask_key(key: str) -> str:
    if not key or len(key) < 8:
        return ""
    return key[:5] + "***" + key[-3:]


@config_router.get("", response_model=ConfigResponse)
async def get_current_config():
    await _load_from_db()
    cfg = get_config()
    return ConfigResponse(
        has_api_key=bool(cfg["openai_api_key"]),
        masked_key=_mask_key(cfg["openai_api_key"]),
        model=cfg["model"],
        available_models=AVAILABLE_MODELS,
    )


@config_router.post("", response_model=ConfigResponse)
async def update_config(update: ConfigUpdate):
    await _load_from_db()
    if update.openai_api_key:
        _config["openai_api_key"] = update.openai_api_key
        await _save_setting("openai_api_key", update.openai_api_key)
    if update.model:
        _config["model"] = update.model
        await _save_setting("model", update.model)
    cfg = get_config()
    return ConfigResponse(
        has_api_key=bool(cfg["openai_api_key"]),
        masked_key=_mask_key(cfg["openai_api_key"]),
        model=cfg["model"],
        available_models=AVAILABLE_MODELS,
    )


@config_router.delete("/key")
async def remove_api_key():
    _config["openai_api_key"] = ""
    await _save_setting("openai_api_key", "")
    cfg = get_config()
    # If env var is set, we can't remove it, but we clear the runtime override
    return ConfigResponse(
        has_api_key=bool(cfg["openai_api_key"]),
        masked_key=_mask_key(cfg["openai_api_key"]),
        model=cfg["model"],
        available_models=AVAILABLE_MODELS,
    )
