"""Optional LLM-powered deep analysis using OpenAI-compatible API.

This module provides enhanced analysis when an API key is available.
The system works fully without it — the heuristic engine is the primary scorer.
"""

from __future__ import annotations

import json
import os
from typing import Optional

from ..models.candidate import CandidateProfile


async def get_llm_analysis(candidate: CandidateProfile) -> Optional[dict]:
    """Get LLM-powered qualitative analysis of a candidate.

    Returns None if no API key is configured.
    """
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return None

    try:
        from openai import AsyncOpenAI

        client = AsyncOpenAI(api_key=api_key)

        prompt = f"""Ты — помощник приёмной комиссии университета inVision U.
Проанализируй профиль кандидата и дай краткую качественную оценку.

Профиль кандидата:
- Имя: {candidate.full_name}
- Возраст: {candidate.age}
- Образование: {candidate.education_level.value}
- GPA: {candidate.gpa or 'не указан'}

Эссе о мотивации:
{candidate.essay_motivation[:1000] if candidate.essay_motivation else 'Не предоставлено'}

Эссе о лидерстве:
{candidate.essay_leadership[:1000] if candidate.essay_leadership else 'Не предоставлено'}

Эссе о преодолении трудностей:
{candidate.essay_challenge[:1000] if candidate.essay_challenge else 'Не предоставлено'}

Активности: {json.dumps([a.model_dump() for a in candidate.activities[:5]], ensure_ascii=False) if candidate.activities else 'Не указаны'}

Ответь в формате JSON:
{{
    "qualitative_summary": "2-3 предложения о кандидате",
    "hidden_strengths": ["сильная сторона, которая может быть не очевидна из формальных данных"],
    "concerns": ["возможные зоны риска"],
    "interview_questions": ["рекомендуемые вопросы для интервью с этим кандидатом"]
}}

Отвечай ТОЛЬКО валидным JSON, без markdown."""

        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=500,
        )

        content = response.choices[0].message.content
        return json.loads(content)

    except Exception:
        return None
