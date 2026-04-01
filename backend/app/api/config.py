"""Runtime configuration — API key and model selection."""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

config_router = APIRouter(prefix="/api/config", tags=["config"])

# In-memory config (persists while server runs)
_config: dict = {
    "openai_api_key": "",
    "model": "gpt-4o-mini",
}


class ConfigUpdate(BaseModel):
    openai_api_key: str = ""
    model: str = "gpt-4o-mini"


class ConfigResponse(BaseModel):
    has_api_key: bool
    masked_key: str = ""
    model: str
    available_models: list[str]


AVAILABLE_MODELS = [
    "gpt-4.1",
    "o4-mini",
]


def get_config() -> dict:
    """Get current config. Falls back to env var for API key."""
    import os
    key = _config.get("openai_api_key") or os.getenv("OPENAI_API_KEY", "")
    return {
        "openai_api_key": key,
        "model": _config.get("model", "gpt-4.1"),
    }


def _mask_key(key: str) -> str:
    if not key or len(key) < 8:
        return ""
    return key[:5] + "***" + key[-3:]


@config_router.get("", response_model=ConfigResponse)
async def get_current_config():
    cfg = get_config()
    return ConfigResponse(
        has_api_key=bool(cfg["openai_api_key"]),
        masked_key=_mask_key(cfg["openai_api_key"]),
        model=cfg["model"],
        available_models=AVAILABLE_MODELS,
    )


@config_router.post("", response_model=ConfigResponse)
async def update_config(update: ConfigUpdate):
    if update.openai_api_key:
        _config["openai_api_key"] = update.openai_api_key
    if update.model:
        _config["model"] = update.model
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
    cfg = get_config()
    # If env var is set, we can't remove it, but we clear the runtime override
    return ConfigResponse(
        has_api_key=bool(cfg["openai_api_key"]),
        masked_key=_mask_key(cfg["openai_api_key"]),
        model=cfg["model"],
        available_models=AVAILABLE_MODELS,
    )
