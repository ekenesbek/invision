"""Talent scouting API — scrape, enrich, manage discovered talents."""

from __future__ import annotations

import asyncio

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, delete, func
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models.db_models import TalentDB
from ..services.scrapers.base import ScrapedTalent
# from ..services.scrapers.codeforces import CodeforcesScraper  # disabled
from ..services.scrapers.imo import IMOScraper
from ..services.scrapers.ioi import IOIScraper
from ..services.scrapers.ipho import IPhOScraper
from ..services.scrapers.icho import IChOScraper
from ..services.scrapers.izho import IZhOScraper

talents_router = APIRouter(prefix="/api/talents", tags=["talents"])

# University keywords to filter out higher-education students
_UNI_KEYWORDS = [
    "university", "университет", "institut", "институт", "academy", "академия",
    "колледж", "college", "technical", "техничес", "polytechnic", "политех",
    "iitu", "kbtu", "nu ", "nazarbayev university", "satbayev", "сатпаев",
    "алматинский", "казну", "казнту", "eurasian", "евразийск", "sdu",
    "astana it university", "aitu",
]


def _is_likely_university(org: str) -> bool:
    """Check if organization name looks like a university (not a school)."""
    if not org:
        return False
    org_lower = org.lower()
    return any(kw in org_lower for kw in _UNI_KEYWORDS)


SCRAPERS = {
    # "codeforces": CodeforcesScraper(),  # disabled
    "imo": IMOScraper(),
    "ioi": IOIScraper(),
    "ipho": IPhOScraper(),
    "icho": IChOScraper(),
    "izho": IZhOScraper(),
}

ALL_SOURCES = list(SCRAPERS.keys())


# ─── Helpers ───────────────────────────────────────────────

def _talent_to_dict(row: TalentDB) -> dict:
    return {
        "id": row.id,
        "source": row.source,
        "external_id": row.external_id,
        "full_name": row.full_name,
        "country": row.country,
        "city": row.city,
        "organization": row.organization,
        "achievements": row.achievements or [],
        "profile_url": row.profile_url,
        "ai_profile": row.ai_profile,
        "status": row.status,
        "scraped_at": row.scraped_at.isoformat() if row.scraped_at else None,
    }


async def _upsert_talent(db: AsyncSession, t: ScrapedTalent) -> TalentDB:
    """Insert or update a talent by external_id."""
    result = await db.execute(
        select(TalentDB).where(TalentDB.external_id == t.external_id)
    )
    existing = result.scalar_one_or_none()

    if existing:
        # Merge new achievements
        old_comps = {a.get("competition") for a in (existing.achievements or [])}
        for ach in t.achievements:
            if ach.get("competition") not in old_comps:
                existing.achievements = [*(existing.achievements or []), ach]
        existing.full_name = t.full_name or existing.full_name
        existing.city = t.city or existing.city
        existing.organization = t.organization or existing.organization
        existing.profile_url = t.profile_url or existing.profile_url
        existing.raw_data = t.raw_data or existing.raw_data
        return existing

    talent = TalentDB(
        source=t.source,
        external_id=t.external_id,
        full_name=t.full_name,
        country=t.country,
        city=t.city,
        organization=t.organization,
        achievements=t.achievements,
        profile_url=t.profile_url,
        raw_data=t.raw_data,
        status="discovered",
    )
    db.add(talent)
    return talent


# ─── Endpoints ─────────────────────────────────────────────

@talents_router.get("")
async def list_talents(
    source: str | None = None,
    status: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """List all discovered talents."""
    stmt = select(TalentDB).order_by(TalentDB.scraped_at.desc())
    if source:
        stmt = stmt.where(TalentDB.source == source)
    if status:
        stmt = stmt.where(TalentDB.status == status)
    result = await db.execute(stmt)
    rows = list(result.scalars().all())
    return {"talents": [_talent_to_dict(r) for r in rows], "total": len(rows)}


@talents_router.get("/stats")
async def talent_stats(db: AsyncSession = Depends(get_db)):
    """Get summary stats of discovered talents."""
    result = await db.execute(
        select(TalentDB.source, TalentDB.status, func.count(TalentDB.id))
        .group_by(TalentDB.source, TalentDB.status)
    )
    rows = result.all()

    by_source: dict = {}
    by_status: dict = {}
    for source, status, count in rows:
        by_source[source] = by_source.get(source, 0) + count
        by_status[status] = by_status.get(status, 0) + count

    total = await db.execute(select(func.count(TalentDB.id)))
    return {
        "total": total.scalar() or 0,
        "by_source": by_source,
        "by_status": by_status,
    }


def _default_min_year() -> int:
    from datetime import datetime
    return datetime.now().year - 1  # last 2 years (current + previous)


class ScrapeRequest(BaseModel):
    sources: list[str] = ALL_SOURCES
    min_rating: int = 1200  # codeforces only
    min_year: int | None = None  # auto: current_year - 1
    max_results: int = 100  # codeforces only
    filter_under18: bool = True  # exclude university students


@talents_router.post("/scrape")
async def scrape_talents(req: ScrapeRequest, db: AsyncSession = Depends(get_db)):
    """Run scrapers and save results to DB."""
    min_year = req.min_year if req.min_year is not None else _default_min_year()
    results = {}

    async def run_scraper(name: str):
        scraper = SCRAPERS.get(name)
        if not scraper:
            return name, []
        try:
            talents = await scraper.scrape(
                min_rating=req.min_rating,
                min_year=min_year,
                max_results=req.max_results,
            )
            return name, talents
        except Exception as e:
            return name, {"error": str(e)}

    tasks = [run_scraper(s) for s in req.sources]
    scrape_results = await asyncio.gather(*tasks)

    total_new = 0
    total_updated = 0

    for source_name, talents in scrape_results:
        if isinstance(talents, dict) and "error" in talents:
            results[source_name] = {"error": talents["error"]}
            continue

        new = 0
        updated = 0
        for t in talents:
            # Filter out university students if requested
            if req.filter_under18 and _is_likely_university(t.organization):
                continue

            existing = await db.execute(
                select(TalentDB).where(TalentDB.external_id == t.external_id)
            )
            if existing.scalar_one_or_none():
                updated += 1
            else:
                new += 1
            await _upsert_talent(db, t)

        results[source_name] = {"scraped": len(talents), "new": new, "updated": updated}
        total_new += new
        total_updated += updated

    await db.commit()

    return {
        "results": results,
        "total_new": total_new,
        "total_updated": total_updated,
    }


class StatusUpdate(BaseModel):
    status: str  # discovered / contacted / applied / ignored


@talents_router.patch("/{talent_id}/status")
async def update_talent_status(
    talent_id: int, update: StatusUpdate, db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(TalentDB).where(TalentDB.id == talent_id))
    talent = result.scalar_one_or_none()
    if not talent:
        raise HTTPException(status_code=404, detail="Talent not found")
    talent.status = update.status
    await db.commit()
    await db.refresh(talent)
    return _talent_to_dict(talent)


@talents_router.post("/{talent_id}/enrich")
async def enrich_talent_with_ai(talent_id: int, db: AsyncSession = Depends(get_db)):
    """Generate AI profile summary for a talent."""
    import os
    from ..api.config import get_config

    result = await db.execute(select(TalentDB).where(TalentDB.id == talent_id))
    talent = result.scalar_one_or_none()
    if not talent:
        raise HTTPException(status_code=404, detail="Talent not found")

    cfg = get_config()
    api_key = cfg.get("openai_api_key") or os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=400, detail="OpenAI API key not configured")

    from openai import AsyncOpenAI
    client = AsyncOpenAI(api_key=api_key)
    model = cfg.get("model", "gpt-4.1")

    achievements_text = "\n".join(
        f"- {a.get('competition', '')}: {a.get('result', '')} (балл: {a.get('score', 'N/A')})"
        for a in (talent.achievements or [])
    )

    prompt = f"""Ты — AI-рекрутер приёмной комиссии inVision U. Тебе предоставлен профиль талантливого кандидата, найденного через открытые источники.

Источник: {talent.source}
ФИО: {talent.full_name}
Страна: {talent.country}
Город: {talent.city or 'Неизвестно'}
Организация/школа: {talent.organization or 'Неизвестно'}
Профиль: {talent.profile_url}

Достижения:
{achievements_text}

На основе этих данных составь краткий профиль кандидата для комиссии. Ответь в формате JSON:
{{
  "summary": "2-3 предложения о кандидате",
  "estimated_strength": "high/medium/low",
  "key_qualities": ["качество1", "качество2", "качество3"],
  "recommended_track": "какое направление подойдёт (CS/Math/Engineering/другое)",
  "outreach_suggestion": "как лучше связаться и заинтересовать кандидата",
  "interview_questions": ["вопрос1", "вопрос2", "вопрос3"],
  "potential_score_estimate": 0-100
}}

Отвечай только JSON, без markdown."""

    try:
        resp = await client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=800,
            temperature=0.5,
        )
        import json
        answer = resp.choices[0].message.content.strip()
        # Strip markdown fences if present
        if answer.startswith("```"):
            answer = answer.split("\n", 1)[1].rsplit("```", 1)[0]
        ai_profile = json.loads(answer)
    except Exception as e:
        ai_profile = {"error": str(e), "raw": resp.choices[0].message.content if 'resp' in dir() else ""}

    talent.ai_profile = ai_profile
    await db.commit()
    await db.refresh(talent)
    return _talent_to_dict(talent)


@talents_router.post("/enrich-all")
async def enrich_all_talents(db: AsyncSession = Depends(get_db)):
    """Enrich all talents that don't have an AI profile yet."""
    import os
    from ..api.config import get_config

    cfg = get_config()
    api_key = cfg.get("openai_api_key") or os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=400, detail="OpenAI API key not configured")

    result = await db.execute(
        select(TalentDB).where(TalentDB.ai_profile.is_(None))
    )
    talents = list(result.scalars().all())

    if not talents:
        return {"enriched": 0, "message": "All talents already have AI profiles"}

    from openai import AsyncOpenAI
    client = AsyncOpenAI(api_key=api_key)
    model = cfg.get("model", "gpt-4.1")

    enriched = 0
    for talent in talents:
        achievements_text = "\n".join(
            f"- {a.get('competition', '')}: {a.get('result', '')} (балл: {a.get('score', 'N/A')})"
            for a in (talent.achievements or [])
        )

        prompt = f"""Составь краткий профиль кандидата для приёмной комиссии inVision U.

Источник: {talent.source} | ФИО: {talent.full_name} | Страна: {talent.country} | Город: {talent.city or '?'} | Школа: {talent.organization or '?'}
Достижения:
{achievements_text}

Ответь JSON: {{"summary": "...", "estimated_strength": "high/medium/low", "key_qualities": [...], "recommended_track": "...", "potential_score_estimate": 0-100}}
Только JSON."""

        try:
            resp = await client.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": prompt}],
                max_tokens=400,
                temperature=0.5,
            )
            import json
            answer = resp.choices[0].message.content.strip()
            if answer.startswith("```"):
                answer = answer.split("\n", 1)[1].rsplit("```", 1)[0]
            talent.ai_profile = json.loads(answer)
            enriched += 1
        except Exception:
            pass

    await db.commit()
    return {"enriched": enriched, "total": len(talents)}


@talents_router.delete("/{talent_id}")
async def delete_talent(talent_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(delete(TalentDB).where(TalentDB.id == talent_id))
    await db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Talent not found")
    return {"deleted": True}


@talents_router.delete("")
async def delete_all_talents(db: AsyncSession = Depends(get_db)):
    """Clear all talents."""
    await db.execute(delete(TalentDB))
    await db.commit()
    return {"deleted": True}
