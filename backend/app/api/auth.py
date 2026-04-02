"""Simple authentication API."""

import hashlib
import secrets

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db, engine, Base
from ..models.db_models import UserDB, SessionDB

auth_router = APIRouter(prefix="/api/auth", tags=["auth"])


def _hash(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


async def seed_user(db: AsyncSession):
    """Create default user if not exists."""
    result = await db.execute(select(UserDB).where(UserDB.email == "yersain@gmail.com"))
    if not result.scalar_one_or_none():
        db.add(UserDB(email="yersain@gmail.com", password_hash=_hash("SecretPassword1!")))
        await db.commit()


class LoginRequest(BaseModel):
    email: str
    password: str


class AuthResponse(BaseModel):
    token: str
    email: str


@auth_router.post("/login", response_model=AuthResponse)
async def login(req: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(UserDB).where(UserDB.email == req.email)
    )
    user = result.scalar_one_or_none()
    if not user or user.password_hash != _hash(req.password):
        raise HTTPException(status_code=401, detail="Неверная почта или пароль")

    token = secrets.token_hex(32)
    db.add(SessionDB(token=token, user_id=user.id))
    await db.commit()
    return AuthResponse(token=token, email=user.email)


@auth_router.get("/me")
async def get_me(request: Request, db: AsyncSession = Depends(get_db)):
    token = request.headers.get("Authorization", "").replace("Bearer ", "")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    result = await db.execute(select(SessionDB).where(SessionDB.token == token))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")

    result = await db.execute(select(UserDB).where(UserDB.id == session.user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    return {"email": user.email}


@auth_router.post("/logout")
async def logout(request: Request, db: AsyncSession = Depends(get_db)):
    token = request.headers.get("Authorization", "").replace("Bearer ", "")
    if token:
        result = await db.execute(select(SessionDB).where(SessionDB.token == token))
        session = result.scalar_one_or_none()
        if session:
            await db.delete(session)
            await db.commit()
    return {"ok": True}
