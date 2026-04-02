"""CRUD API for persistent candidate management."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from ..crud import (
    add_chat_message,
    clear_chat_history,
    create_candidate,
    create_candidates_bulk,
    delete_candidate,
    get_all_candidates,
    get_candidate,
    get_chat_history,
    get_scoring_result,
    get_all_scoring_results,
    save_scoring_result,
    update_candidate_status,
)
from ..database import get_db
from ..models.candidate import ActivityEntry, CandidateProfile, ScoringResult
from ..services.scoring_engine import score_candidate, score_candidate_with_llm

candidates_router = APIRouter(prefix="/api/candidates", tags=["candidates"])


# ─── Serialization helpers ──────────────────────────────

def _db_to_dict(row) -> dict:
    """Convert a CandidateDB row to a frontend-friendly dict."""
    return {
        "id": row.id,
        "full_name": row.full_name,
        "age": row.age,
        "city": row.city,
        "education_level": row.education_level,
        "school_name": row.school_name,
        "gpa": row.gpa,
        "essay_motivation": row.essay_motivation,
        "essay_leadership": row.essay_leadership,
        "essay_challenge": row.essay_challenge,
        "activities": row.activities or [],
        "languages": row.languages or [],
        "skills": row.skills or [],
        "video_transcript": row.video_transcript,
        "why_invision": row.why_invision,
        "future_goals": row.future_goals,
        "community_contribution": row.community_contribution,
        "status": row.status,
    }


def _dict_to_profile(data: dict) -> CandidateProfile:
    """Convert a raw dict to CandidateProfile for scoring."""
    activities = [ActivityEntry(**a) for a in data.get("activities", [])]
    return CandidateProfile(**{**data, "activities": activities})


# ─── Request models ─────────────────────────────────────

class CandidateCreate(BaseModel):
    id: str | None = None
    full_name: str
    age: int = 17
    city: str = ""
    education_level: str = "school"
    school_name: str = ""
    gpa: float | None = None
    essay_motivation: str = ""
    essay_leadership: str = ""
    essay_challenge: str = ""
    activities: list[dict] = []
    languages: list[str] = []
    skills: list[str] = []
    video_transcript: str = ""
    why_invision: str = ""
    future_goals: str = ""
    community_contribution: str = ""
    status: str = "pending"


class StatusUpdate(BaseModel):
    status: str  # "pending" | "approved" | "rejected"


class BulkStatusUpdate(BaseModel):
    candidate_ids: list[str]
    status: str


# ─── Endpoints ──────────────────────────────────────────

@candidates_router.get("")
async def list_candidates(status: str | None = None, db: AsyncSession = Depends(get_db)):
    """List all candidates, optionally filtered by status."""
    rows = await get_all_candidates(db, status=status)
    candidates = [_db_to_dict(r) for r in rows]

    # Attach scoring results
    all_results = await get_all_scoring_results(db)
    result_map = {r.candidate_id: r.result_data for r in all_results}

    return {
        "candidates": candidates,
        "scoring_results": result_map,
    }


@candidates_router.post("")
async def add_candidate(data: CandidateCreate, db: AsyncSession = Depends(get_db)):
    """Add a single candidate."""
    d = data.model_dump()
    if not d.get("id"):
        import uuid
        d["id"] = f"C{uuid.uuid4().hex[:6].upper()}"
    row = await create_candidate(db, d)
    return _db_to_dict(row)


@candidates_router.post("/bulk")
async def add_candidates_bulk(candidates: list[CandidateCreate], db: AsyncSession = Depends(get_db)):
    """Add multiple candidates at once."""
    import uuid
    dicts = []
    for c in candidates:
        d = c.model_dump()
        if not d.get("id"):
            d["id"] = f"C{uuid.uuid4().hex[:6].upper()}"
        dicts.append(d)
    rows = await create_candidates_bulk(db, dicts)
    return [_db_to_dict(r) for r in rows]


@candidates_router.patch("/{candidate_id}/status")
async def change_status(candidate_id: str, update: StatusUpdate, db: AsyncSession = Depends(get_db)):
    """Update a candidate's status (pending/approved/rejected)."""
    row = await update_candidate_status(db, candidate_id, update.status)
    if not row:
        raise HTTPException(status_code=404, detail="Candidate not found")
    return _db_to_dict(row)


@candidates_router.patch("/bulk-status")
async def change_bulk_status(update: BulkStatusUpdate, db: AsyncSession = Depends(get_db)):
    """Update status for multiple candidates."""
    updated = []
    for cid in update.candidate_ids:
        row = await update_candidate_status(db, cid, update.status)
        if row:
            updated.append(_db_to_dict(row))
    return updated


@candidates_router.delete("/{candidate_id}")
async def remove_candidate(candidate_id: str, db: AsyncSession = Depends(get_db)):
    """Delete a candidate and their scoring results."""
    ok = await delete_candidate(db, candidate_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Candidate not found")
    return {"deleted": True}


@candidates_router.post("/{candidate_id}/score")
async def score_one_candidate(candidate_id: str, use_llm: bool = True, db: AsyncSession = Depends(get_db)):
    """Score a single candidate and persist the result."""
    row = await get_candidate(db, candidate_id)
    if not row:
        raise HTTPException(status_code=404, detail="Candidate not found")

    profile = _dict_to_profile(_db_to_dict(row))

    if use_llm:
        result = await score_candidate_with_llm(profile)
    else:
        result = score_candidate(profile)

    result_data = result.model_dump()
    await save_scoring_result(db, candidate_id, result.scoring_method, result_data)

    return result_data


@candidates_router.get("/{candidate_id}/score")
async def get_candidate_score(candidate_id: str, db: AsyncSession = Depends(get_db)):
    """Get the latest scoring result for a candidate."""
    sr = await get_scoring_result(db, candidate_id)
    if not sr:
        return None
    return sr.result_data


@candidates_router.post("/score-all")
async def score_all_candidates(
    status: str = "pending",
    use_llm: bool = True,
    auto_distribute: bool = True,
    generate_report: bool = True,
    db: AsyncSession = Depends(get_db),
):
    """Score all candidates with a given status, auto-distribute, and generate AI reports."""
    import asyncio
    import os
    from ..api.config import get_config

    rows = await get_all_candidates(db, status=status)
    if not rows:
        return {"results": [], "distributed": {}, "reports": {}}

    profiles = [_dict_to_profile(_db_to_dict(r)) for r in rows]

    if use_llm:
        tasks = [score_candidate_with_llm(p) for p in profiles]
        results = await asyncio.gather(*tasks)
    else:
        results = [score_candidate(p) for p in profiles]

    # Sort by score
    results = sorted(results, key=lambda r: r.total_score, reverse=True)
    for i, r in enumerate(results):
        r.rank = i + 1

    # Persist results
    for r in results:
        await save_scoring_result(db, r.candidate_id, r.scoring_method, r.model_dump())

    distributed = {"approved": 0, "rejected": 0, "pending": 0}

    if auto_distribute:
        for r in results:
            if r.recommendation in ("strong_recommend", "recommend"):
                new_status = "approved"
            elif r.recommendation == "not_recommended":
                new_status = "rejected"
            else:
                new_status = "pending"
            await update_candidate_status(db, r.candidate_id, new_status)
            distributed[new_status] += 1

    await db.commit()

    # Generate AI reports for each candidate
    reports = {}
    if generate_report and use_llm:
        cfg = get_config()
        api_key = cfg.get("openai_api_key") or os.getenv("OPENAI_API_KEY")
        if api_key:
            from openai import AsyncOpenAI
            client = AsyncOpenAI(api_key=api_key)
            model = cfg.get("model", "gpt-5.4-mini")

            row_map = {r.id: r for r in rows}

            async def gen_report(sr):
                row = row_map.get(sr.candidate_id)
                if not row:
                    return sr.candidate_id, None
                cd = _db_to_dict(row)
                is_good = sr.total_score >= 55

                prompt = f"""Ты — AI-ассистент приёмной комиссии inVision U.
Кандидат: {cd['full_name']}, {cd['age']} лет, {cd['city']}
Школа: {cd['school_name']}, GPA: {cd['gpa']}
Балл: {sr.total_score}/100, Рекомендация: {sr.recommendation_label}
Метод: {sr.scoring_method}
Сильные стороны: {', '.join(sr.strengths)}
Зоны для рассмотрения: {', '.join(sr.areas_for_review)}

Эссе мотивация: {cd.get('essay_motivation', '')[:300]}
Эссе лидерство: {cd.get('essay_leadership', '')[:300]}

{'Кандидат рекомендован.' if is_good else 'Кандидат НЕ рекомендован.'}

Напиши краткий отчёт для комиссии (3-5 предложений) и предложи 3 вопроса для интервью. Отвечай на русском."""

                try:
                    resp = await client.chat.completions.create(
                        model=model,
                        messages=[{"role": "user", "content": prompt}],
                        max_tokens=500,
                        temperature=0.7,
                    )
                    answer = resp.choices[0].message.content
                    # Save as chat message
                    await add_chat_message(db, sr.candidate_id, "assistant", f"📋 Автоматический отчёт:\n\n{answer}")
                    return sr.candidate_id, answer
                except Exception:
                    return sr.candidate_id, None

            report_tasks = [gen_report(r) for r in results]
            report_results = await asyncio.gather(*report_tasks)
            reports = {cid: text for cid, text in report_results if text}
            await db.commit()

    return {
        "results": [r.model_dump() for r in results],
        "distributed": distributed,
        "reports": reports,
    }


class AskAIRequest(BaseModel):
    question: str


@candidates_router.post("/{candidate_id}/ask")
async def ask_ai_about_candidate(candidate_id: str, req: AskAIRequest, db: AsyncSession = Depends(get_db)):
    """Ask AI a question about a specific candidate."""
    import os
    from ..api.config import get_config

    row = await get_candidate(db, candidate_id)
    if not row:
        raise HTTPException(status_code=404, detail="Candidate not found")

    cfg = get_config()
    api_key = cfg.get("openai_api_key") or os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=400, detail="OpenAI API key not configured")

    candidate_data = _db_to_dict(row)

    # Get scoring result if available
    sr = await get_scoring_result(db, candidate_id)
    score_context = ""
    if sr:
        rd = sr.result_data
        score_context = f"""
Результат оценки:
- Общий балл: {rd.get('total_score')}/100
- Рекомендация: {rd.get('recommendation_label')}
- Метод: {rd.get('scoring_method')}
- Сильные стороны: {', '.join(rd.get('strengths', []))}
- Зоны для рассмотрения: {', '.join(rd.get('areas_for_review', []))}
- AI-детекция: {'Обнаружен' if rd.get('ai_detection', {}).get('is_likely_ai_generated') else 'Не обнаружен'}
"""

    from openai import AsyncOpenAI
    client = AsyncOpenAI(api_key=api_key)
    model = cfg.get("model", "gpt-5.4-mini")

    system_prompt = f"""Ты — AI-ассистент приёмной комиссии inVision U. Тебе предоставлены данные кандидата.
Отвечай на вопросы сотрудника комиссии о кандидате. Будь конкретным, опирайся на данные.
Отвечай на русском языке. Будь лаконичным но информативным.

Данные кандидата:
- ФИО: {candidate_data['full_name']}
- Возраст: {candidate_data['age']}, Город: {candidate_data['city']}
- Школа: {candidate_data['school_name']}, GPA: {candidate_data['gpa']}
- Языки: {', '.join(candidate_data.get('languages', []))}
- Навыки: {', '.join(candidate_data.get('skills', []))}
- Активности: {'; '.join(a['title'] + ' (' + a['role'] + ')' for a in candidate_data.get('activities', []) if a.get('title'))}

Эссе — Мотивация:
{candidate_data.get('essay_motivation', 'Нет')}

Эссе — Лидерство:
{candidate_data.get('essay_leadership', 'Нет')}

Эссе — Вызовы:
{candidate_data.get('essay_challenge', 'Нет')}

Почему inVision U: {candidate_data.get('why_invision', 'Нет')}
Цели на 5 лет: {candidate_data.get('future_goals', 'Нет')}
Вклад в сообщество: {candidate_data.get('community_contribution', 'Нет')}
{score_context}"""

    # Load chat history for context
    history = await get_chat_history(db, candidate_id)
    messages = [{"role": "system", "content": system_prompt}]
    for msg in history:
        messages.append({"role": msg.role, "content": msg.content})
    messages.append({"role": "user", "content": req.question})

    response = await client.chat.completions.create(
        model=model,
        messages=messages,
        max_tokens=1000,
        temperature=0.7,
    )

    answer = response.choices[0].message.content

    # Persist both messages
    await add_chat_message(db, candidate_id, "user", req.question)
    await add_chat_message(db, candidate_id, "assistant", answer)

    return {"answer": answer}


@candidates_router.get("/{candidate_id}/chat")
async def get_candidate_chat(candidate_id: str, db: AsyncSession = Depends(get_db)):
    """Get chat history for a candidate."""
    history = await get_chat_history(db, candidate_id)
    return [{"role": m.role, "content": m.content} for m in history]


@candidates_router.delete("/{candidate_id}/chat")
async def clear_candidate_chat(candidate_id: str, db: AsyncSession = Depends(get_db)):
    """Clear chat history for a candidate."""
    await clear_chat_history(db, candidate_id)
    return {"cleared": True}


@candidates_router.post("/seed")
async def seed_demo_candidates(db: AsyncSession = Depends(get_db)):
    """Seed the database with sample candidates (idempotent)."""
    from ..data.sample_candidates import SAMPLE_CANDIDATES

    existing = await get_all_candidates(db)
    if existing:
        return {"message": "Database already has candidates", "count": len(existing)}

    dicts = []
    for c in SAMPLE_CANDIDATES:
        d = dict(c)
        if not d.get("id"):
            import uuid
            d["id"] = f"C{uuid.uuid4().hex[:6].upper()}"
        d["status"] = "pending"
        dicts.append(d)

    rows = await create_candidates_bulk(db, dicts)
    return {"message": "Seeded", "count": len(rows)}
