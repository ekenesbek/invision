"""CRUD operations for candidates and scoring results."""

from __future__ import annotations

from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from .models.db_models import CandidateDB, ChatMessageDB, ScoringResultDB


# ─── Candidates ─────────────────────────────────────────

async def get_all_candidates(db: AsyncSession, status: str | None = None) -> list[CandidateDB]:
    stmt = select(CandidateDB).order_by(CandidateDB.created_at)
    if status:
        stmt = stmt.where(CandidateDB.status == status)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_candidate(db: AsyncSession, candidate_id: str) -> CandidateDB | None:
    result = await db.execute(select(CandidateDB).where(CandidateDB.id == candidate_id))
    return result.scalar_one_or_none()


async def create_candidate(db: AsyncSession, data: dict) -> CandidateDB:
    candidate = CandidateDB(**data)
    db.add(candidate)
    await db.commit()
    await db.refresh(candidate)
    return candidate


async def create_candidates_bulk(db: AsyncSession, candidates: list[dict]) -> list[CandidateDB]:
    objects = [CandidateDB(**c) for c in candidates]
    db.add_all(objects)
    await db.commit()
    for obj in objects:
        await db.refresh(obj)
    return objects


async def update_candidate_status(db: AsyncSession, candidate_id: str, status: str) -> CandidateDB | None:
    candidate = await get_candidate(db, candidate_id)
    if not candidate:
        return None
    candidate.status = status
    await db.commit()
    await db.refresh(candidate)
    return candidate


async def delete_candidate(db: AsyncSession, candidate_id: str) -> bool:
    result = await db.execute(delete(CandidateDB).where(CandidateDB.id == candidate_id))
    await db.execute(delete(ScoringResultDB).where(ScoringResultDB.candidate_id == candidate_id))
    await db.commit()
    return result.rowcount > 0


# ─── Scoring Results ────────────────────────────────────

async def save_scoring_result(db: AsyncSession, candidate_id: str, method: str, result_data: dict) -> ScoringResultDB:
    # Delete previous result for this candidate (keep latest only)
    await db.execute(delete(ScoringResultDB).where(ScoringResultDB.candidate_id == candidate_id))
    record = ScoringResultDB(candidate_id=candidate_id, scoring_method=method, result_data=result_data)
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return record


async def get_scoring_result(db: AsyncSession, candidate_id: str) -> ScoringResultDB | None:
    result = await db.execute(
        select(ScoringResultDB)
        .where(ScoringResultDB.candidate_id == candidate_id)
        .order_by(ScoringResultDB.created_at.desc())
    )
    return result.scalar_one_or_none()


async def get_all_scoring_results(db: AsyncSession) -> list[ScoringResultDB]:
    result = await db.execute(select(ScoringResultDB).order_by(ScoringResultDB.created_at.desc()))
    return list(result.scalars().all())


# ─── Chat Messages ──────────────────────────────────────

async def get_chat_history(db: AsyncSession, candidate_id: str) -> list[ChatMessageDB]:
    result = await db.execute(
        select(ChatMessageDB)
        .where(ChatMessageDB.candidate_id == candidate_id)
        .order_by(ChatMessageDB.created_at)
    )
    return list(result.scalars().all())


async def add_chat_message(db: AsyncSession, candidate_id: str, role: str, content: str) -> ChatMessageDB:
    msg = ChatMessageDB(candidate_id=candidate_id, role=role, content=content)
    db.add(msg)
    await db.commit()
    await db.refresh(msg)
    return msg


async def clear_chat_history(db: AsyncSession, candidate_id: str) -> None:
    await db.execute(delete(ChatMessageDB).where(ChatMessageDB.candidate_id == candidate_id))
    await db.commit()


# ─── Bulk Reset Operations ─────────────────────────────

async def clear_all_scores(db: AsyncSession) -> int:
    """Delete all scoring results and chat messages, reset candidate statuses to pending."""
    scores = await db.execute(delete(ScoringResultDB))
    await db.execute(delete(ChatMessageDB))
    # Reset all statuses to pending
    from sqlalchemy import update
    await db.execute(update(CandidateDB).values(status="pending"))
    await db.commit()
    return scores.rowcount


async def clear_all_candidates(db: AsyncSession) -> int:
    """Delete all candidates, scoring results, and chat messages."""
    await db.execute(delete(ChatMessageDB))
    await db.execute(delete(ScoringResultDB))
    result = await db.execute(delete(CandidateDB))
    await db.commit()
    return result.rowcount
