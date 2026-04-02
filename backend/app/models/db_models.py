"""SQLAlchemy ORM models for persistent storage."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import String, Float, Integer, DateTime, Text, JSON, func
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class UserDB(Base):
    """Admin user for authentication."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(200), unique=True)
    password_hash: Mapped[str] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class SessionDB(Base):
    """User session tokens."""

    __tablename__ = "sessions"

    token: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class CandidateDB(Base):
    """Persistent candidate record."""

    __tablename__ = "candidates"

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    full_name: Mapped[str] = mapped_column(String(200))
    age: Mapped[int] = mapped_column(Integer)
    city: Mapped[str] = mapped_column(String(100), default="")
    education_level: Mapped[str] = mapped_column(String(20), default="school")
    school_name: Mapped[str] = mapped_column(String(200), default="")
    gpa: Mapped[float | None] = mapped_column(Float, nullable=True)

    essay_motivation: Mapped[str] = mapped_column(Text, default="")
    essay_leadership: Mapped[str] = mapped_column(Text, default="")
    essay_challenge: Mapped[str] = mapped_column(Text, default="")

    activities: Mapped[dict] = mapped_column(JSON, default=list)
    languages: Mapped[dict] = mapped_column(JSON, default=list)
    skills: Mapped[dict] = mapped_column(JSON, default=list)

    video_transcript: Mapped[str] = mapped_column(Text, default="")
    why_invision: Mapped[str] = mapped_column(Text, default="")
    future_goals: Mapped[str] = mapped_column(Text, default="")
    community_contribution: Mapped[str] = mapped_column(Text, default="")

    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending / approved / rejected

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())


class ChatMessageDB(Base):
    """Chat message between user and AI about a candidate."""

    __tablename__ = "chat_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    candidate_id: Mapped[str] = mapped_column(String(50), index=True)
    role: Mapped[str] = mapped_column(String(20))  # "user" or "assistant"
    content: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class TalentDB(Base):
    """Externally discovered talent from scraping."""

    __tablename__ = "talents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    source: Mapped[str] = mapped_column(String(30))  # codeforces / imo / ioi
    external_id: Mapped[str] = mapped_column(String(100), unique=True)
    full_name: Mapped[str] = mapped_column(String(200))
    country: Mapped[str] = mapped_column(String(100), default="Kazakhstan")
    city: Mapped[str] = mapped_column(String(100), default="")
    organization: Mapped[str] = mapped_column(String(300), default="")
    achievements: Mapped[dict] = mapped_column(JSON, default=list)
    profile_url: Mapped[str] = mapped_column(String(500), default="")
    raw_data: Mapped[dict] = mapped_column(JSON, default=dict)
    ai_profile: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # AI-enriched profile
    status: Mapped[str] = mapped_column(String(20), default="discovered")  # discovered / contacted / applied / ignored
    scraped_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())


class ScoringResultDB(Base):
    """Persistent scoring result linked to a candidate."""

    __tablename__ = "scoring_results"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    candidate_id: Mapped[str] = mapped_column(String(50), index=True)
    scoring_method: Mapped[str] = mapped_column(String(20))  # "llm" or "heuristic"
    result_data: Mapped[dict] = mapped_column(JSON)  # full ScoringResult as JSON
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
