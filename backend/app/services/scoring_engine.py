"""Multi-criteria scoring engine with explainability.

Supports two modes:
1. LLM-first scoring (when OPENAI_API_KEY is available)
2. Heuristic fallback (keyword-based, always works)
"""

from __future__ import annotations

import uuid
from typing import Optional

from ..models.candidate import (
    AIDetectionResult,
    CandidateProfile,
    DimensionScore,
    ScoringResult,
)
from .baseline_scorer import baseline_score_candidate
from .text_analyzer import analyze_essays, detect_ai_generated


# Scoring weights — aligned with inVision U values
DIMENSION_WEIGHTS = {
    "leadership_potential": 0.25,
    "growth_trajectory": 0.20,
    "motivation_passion": 0.20,
    "impact_contribution": 0.15,
    "authenticity": 0.10,
    "academic_profile": 0.10,
}

DIMENSION_LABELS = {
    "leadership_potential": "Лидерский потенциал",
    "growth_trajectory": "Траектория роста",
    "motivation_passion": "Мотивация и увлечённость",
    "impact_contribution": "Вклад и влияние",
    "authenticity": "Аутентичность текста",
    "academic_profile": "Академический профиль",
}

RECOMMENDATION_THRESHOLDS = {
    "strong_recommend": (75, "Настоятельно рекомендован"),
    "recommend": (55, "Рекомендован"),
    "review": (35, "Требует дополнительного рассмотрения"),
    "not_recommended": (0, "Не рекомендован"),
}


def _score_academic(candidate: CandidateProfile) -> tuple[float, list[str]]:
    """Score academic profile from structured data."""
    score = 0.0
    signals = []

    if candidate.gpa is not None:
        gpa_pct = (candidate.gpa / 5.0) * 60
        score += gpa_pct
        signals.append(f"GPA: {candidate.gpa}/5.0")

    if candidate.languages:
        lang_bonus = min(len(candidate.languages) * 10, 20)
        score += lang_bonus
        signals.append(f"Владеет {len(candidate.languages)} языками: {', '.join(candidate.languages)}")

    if candidate.skills:
        skill_bonus = min(len(candidate.skills) * 5, 20)
        score += skill_bonus
        signals.append(f"Навыки: {', '.join(candidate.skills[:5])}")

    return min(score, 100), signals


def _score_activities(candidate: CandidateProfile) -> tuple[float, list[str]]:
    """Score extracurricular activities — especially leadership roles."""
    if not candidate.activities:
        return 0.0, ["Нет указанных активностей"]

    score = 0.0
    signals = []
    leadership_roles = 0

    for activity in candidate.activities:
        # Base points for having activities
        score += 10

        role_lower = activity.role.lower()
        if any(kw in role_lower for kw in ["leader", "founder", "president", "organizer",
                                            "лидер", "основатель", "организатор", "председатель"]):
            leadership_roles += 1
            score += 15
            signals.append(f"Лидерская роль: {activity.title} ({activity.role})")
        elif any(kw in role_lower for kw in ["volunteer", "mentor", "волонтёр", "наставник"]):
            score += 10
            signals.append(f"Волонтёрство/наставничество: {activity.title}")
        else:
            signals.append(f"Участие: {activity.title}")

        if activity.impact:
            score += 10
            signals.append(f"Измеримый результат: {activity.impact}")

    if leadership_roles == 0:
        signals.append("Не указаны лидерские роли в активностях")

    return min(score, 100), signals


def _determine_recommendation(total_score: float) -> tuple[str, str]:
    """Determine recommendation key and label from total score."""
    for rec_key, (threshold, label) in RECOMMENDATION_THRESHOLDS.items():
        if total_score >= threshold:
            return rec_key, label
    return "not_recommended", "Не рекомендован"


def _build_summary(
    candidate: CandidateProfile,
    total_score: float,
    ai_detected: bool,
    ai_confidence: float,
    strengths: list[str],
) -> str:
    """Generate a human-readable summary."""
    summary_parts = []
    if total_score >= 75:
        summary_parts.append(f"Кандидат {candidate.full_name} демонстрирует высокий потенциал.")
    elif total_score >= 55:
        summary_parts.append(f"Кандидат {candidate.full_name} показывает хороший потенциал.")
    elif total_score >= 35:
        summary_parts.append(f"Профиль кандидата {candidate.full_name} требует дополнительного рассмотрения.")
    else:
        summary_parts.append(f"Профиль кандидата {candidate.full_name} не соответствует основным критериям.")

    if ai_detected:
        summary_parts.append(
            f"⚠️ Обнаружены признаки использования AI при написании эссе (уверенность: {ai_confidence:.0%})."
        )

    if strengths:
        summary_parts.append(f"Сильные стороны: {', '.join(s.split(':')[0] for s in strengths)}.")

    return " ".join(summary_parts)


def score_candidate(candidate: CandidateProfile) -> ScoringResult:
    """Score a single candidate across all dimensions with full explainability.

    This is the HEURISTIC scorer — keyword-based, always available.
    """

    candidate_id = candidate.id or str(uuid.uuid4())[:8]

    # 1. Analyze text
    text_result = analyze_essays(
        essay_motivation=candidate.essay_motivation,
        essay_leadership=candidate.essay_leadership,
        essay_challenge=candidate.essay_challenge,
        video_transcript=candidate.video_transcript,
        why_invision=candidate.why_invision,
        future_goals=candidate.future_goals,
        community_contribution=candidate.community_contribution,
    )

    # 2. AI detection
    all_essays = " ".join([
        candidate.essay_motivation,
        candidate.essay_leadership,
        candidate.essay_challenge,
    ])
    ai_detected, ai_confidence, ai_indicators = detect_ai_generated(all_essays)

    # 3. Score activities
    activity_score, activity_signals = _score_activities(candidate)

    # 4. Score academic profile
    academic_score, academic_signals = _score_academic(candidate)

    # 5. Build dimension scores
    dimensions = []

    # Leadership potential = text leadership signals + activity leadership
    leadership_raw = text_result.leadership_score * 0.5 + activity_score * 0.5
    dimensions.append(DimensionScore(
        name=DIMENSION_LABELS["leadership_potential"],
        score=round(leadership_raw, 1),
        weight=DIMENSION_WEIGHTS["leadership_potential"],
        explanation="Оценка лидерских качеств на основе эссе и внеучебных активностей",
        key_signals=(text_result.leadership_signals[:3] + activity_signals[:2]),
    ))

    # Growth trajectory
    dimensions.append(DimensionScore(
        name=DIMENSION_LABELS["growth_trajectory"],
        score=round(text_result.growth_score, 1),
        weight=DIMENSION_WEIGHTS["growth_trajectory"],
        explanation="Оценка траектории роста: преодоление трудностей, адаптация, развитие",
        key_signals=text_result.growth_signals[:5],
    ))

    # Motivation & passion
    dimensions.append(DimensionScore(
        name=DIMENSION_LABELS["motivation_passion"],
        score=round(text_result.passion_score, 1),
        weight=DIMENSION_WEIGHTS["motivation_passion"],
        explanation="Оценка мотивации, увлечённости и понимания миссии inVision U",
        key_signals=text_result.passion_signals[:5],
    ))

    # Impact & contribution
    dimensions.append(DimensionScore(
        name=DIMENSION_LABELS["impact_contribution"],
        score=round(text_result.impact_score, 1),
        weight=DIMENSION_WEIGHTS["impact_contribution"],
        explanation="Оценка реального вклада и влияния кандидата на сообщество",
        key_signals=text_result.impact_signals[:5],
    ))

    # Authenticity
    dimensions.append(DimensionScore(
        name=DIMENSION_LABELS["authenticity"],
        score=round(text_result.authenticity_score, 1),
        weight=DIMENSION_WEIGHTS["authenticity"],
        explanation="Оценка подлинности текста (детекция AI-генерированного контента)",
        key_signals=ai_indicators[:3],
    ))

    # Academic profile
    dimensions.append(DimensionScore(
        name=DIMENSION_LABELS["academic_profile"],
        score=round(academic_score, 1),
        weight=DIMENSION_WEIGHTS["academic_profile"],
        explanation="Академические достижения, навыки и языки",
        key_signals=academic_signals[:5],
    ))

    # 6. Compute weighted total
    total_score = sum(d.score * d.weight for d in dimensions)
    total_score = round(total_score, 1)

    # 7. Determine recommendation
    recommendation, recommendation_label = _determine_recommendation(total_score)

    # 8. Identify strengths and areas for review
    sorted_dims = sorted(dimensions, key=lambda d: d.score, reverse=True)
    strengths = [
        f"{d.name}: {d.score}/100"
        for d in sorted_dims[:3]
        if d.score >= 50
    ]
    areas_for_review = [
        f"{d.name}: {d.score}/100"
        for d in sorted_dims
        if d.score < 40
    ]

    # 9. Generate summary
    summary = _build_summary(candidate, total_score, ai_detected, ai_confidence, strengths)

    # 10. Compute baseline score for comparison
    b_score = baseline_score_candidate(candidate)

    return ScoringResult(
        candidate_id=candidate_id,
        candidate_name=candidate.full_name,
        total_score=total_score,
        recommendation=recommendation,
        recommendation_label=recommendation_label,
        dimensions=dimensions,
        ai_detection=AIDetectionResult(
            is_likely_ai_generated=ai_detected,
            confidence=round(ai_confidence, 2),
            indicators=ai_indicators,
        ),
        summary=summary,
        strengths=strengths,
        areas_for_review=areas_for_review,
        scoring_method="heuristic",
        baseline_score=b_score,
    )


async def score_candidate_with_llm(candidate: CandidateProfile) -> ScoringResult:
    """Score a candidate using LLM-first approach with heuristic fallback.

    1. Try LLM scoring first
    2. If LLM succeeds — use LLM scores for essay dimensions, merge with
       heuristic academic/activity scoring
    3. If LLM fails — fall back to heuristic score_candidate()
    """
    from .llm_analyzer import llm_score_candidate

    candidate_id = candidate.id or str(uuid.uuid4())[:8]

    # Try LLM scoring
    llm_result = await llm_score_candidate(candidate)

    if llm_result is None:
        # Fallback to heuristic
        return score_candidate(candidate)

    # LLM succeeded — build the result using LLM dimension scores
    # but merge with heuristic academic/activity scoring

    # Heuristic scores for structured data (activities + academics)
    activity_score, activity_signals = _score_activities(candidate)
    academic_score, academic_signals = _score_academic(candidate)

    dimensions = []

    # Leadership: blend LLM score with heuristic activity score
    llm_leadership = llm_result["leadership_potential"]
    leadership_blended = llm_leadership["score"] * 0.7 + activity_score * 0.3
    dimensions.append(DimensionScore(
        name=DIMENSION_LABELS["leadership_potential"],
        score=round(min(leadership_blended, 100), 1),
        weight=DIMENSION_WEIGHTS["leadership_potential"],
        explanation=llm_leadership.get("explanation", "LLM-assessed leadership potential"),
        key_signals=llm_leadership.get("key_signals", [])[:3] + activity_signals[:2],
    ))

    # Growth trajectory — fully from LLM
    llm_growth = llm_result["growth_trajectory"]
    dimensions.append(DimensionScore(
        name=DIMENSION_LABELS["growth_trajectory"],
        score=round(min(float(llm_growth["score"]), 100), 1),
        weight=DIMENSION_WEIGHTS["growth_trajectory"],
        explanation=llm_growth.get("explanation", "LLM-assessed growth trajectory"),
        key_signals=llm_growth.get("key_signals", [])[:5],
    ))

    # Motivation & passion — fully from LLM
    llm_passion = llm_result["motivation_passion"]
    dimensions.append(DimensionScore(
        name=DIMENSION_LABELS["motivation_passion"],
        score=round(min(float(llm_passion["score"]), 100), 1),
        weight=DIMENSION_WEIGHTS["motivation_passion"],
        explanation=llm_passion.get("explanation", "LLM-assessed motivation and passion"),
        key_signals=llm_passion.get("key_signals", [])[:5],
    ))

    # Impact & contribution — fully from LLM
    llm_impact = llm_result["impact_contribution"]
    dimensions.append(DimensionScore(
        name=DIMENSION_LABELS["impact_contribution"],
        score=round(min(float(llm_impact["score"]), 100), 1),
        weight=DIMENSION_WEIGHTS["impact_contribution"],
        explanation=llm_impact.get("explanation", "LLM-assessed impact and contribution"),
        key_signals=llm_impact.get("key_signals", [])[:5],
    ))

    # Authenticity — from LLM
    llm_auth = llm_result["authenticity"]
    dimensions.append(DimensionScore(
        name=DIMENSION_LABELS["authenticity"],
        score=round(min(float(llm_auth["score"]), 100), 1),
        weight=DIMENSION_WEIGHTS["authenticity"],
        explanation=llm_auth.get("explanation", "LLM-assessed text authenticity"),
        key_signals=llm_auth.get("key_signals", [])[:3],
    ))

    # Academic profile — from heuristics (structured data, not essay-based)
    dimensions.append(DimensionScore(
        name=DIMENSION_LABELS["academic_profile"],
        score=round(academic_score, 1),
        weight=DIMENSION_WEIGHTS["academic_profile"],
        explanation="Академические достижения, навыки и языки",
        key_signals=academic_signals[:5],
    ))

    # Compute weighted total
    total_score = sum(d.score * d.weight for d in dimensions)
    total_score = round(min(total_score, 100), 1)

    # Recommendation
    recommendation, recommendation_label = _determine_recommendation(total_score)

    # AI detection from LLM
    llm_ai = llm_result.get("ai_detection", {})
    ai_indicators = llm_ai.get("indicators", [])
    ai_detected = llm_ai.get("is_likely_ai", False)
    ai_confidence = llm_ai.get("confidence", 0.0)

    # Strengths and areas for review
    sorted_dims = sorted(dimensions, key=lambda d: d.score, reverse=True)
    strengths = [
        f"{d.name}: {d.score}/100"
        for d in sorted_dims[:3]
        if d.score >= 50
    ]
    areas_for_review = [
        f"{d.name}: {d.score}/100"
        for d in sorted_dims
        if d.score < 40
    ]

    # Summary — use LLM's qualitative summary if available, otherwise generate
    llm_summary = llm_result.get("qualitative_summary", "")
    summary = _build_summary(candidate, total_score, ai_detected, ai_confidence, strengths)
    if llm_summary:
        summary += f"\n\n📝 Качественный анализ AI: {llm_summary}"

    # Baseline score for comparison
    b_score = baseline_score_candidate(candidate)

    # Extract the extra LLM analysis fields
    llm_analysis = {
        "hidden_strengths": llm_result.get("hidden_strengths", []),
        "concerns": llm_result.get("concerns", []),
        "interview_questions": llm_result.get("interview_questions", []),
        "qualitative_summary": llm_summary,
    }

    return ScoringResult(
        candidate_id=candidate_id,
        candidate_name=candidate.full_name,
        total_score=total_score,
        recommendation=recommendation,
        recommendation_label=recommendation_label,
        dimensions=dimensions,
        ai_detection=AIDetectionResult(
            is_likely_ai_generated=ai_detected,
            confidence=round(ai_confidence, 2),
            indicators=ai_indicators,
        ),
        summary=summary,
        strengths=strengths,
        areas_for_review=areas_for_review,
        scoring_method="llm",
        llm_analysis=llm_analysis,
        baseline_score=b_score,
    )


async def score_batch_with_llm(candidates: list[CandidateProfile]) -> list[ScoringResult]:
    """Score multiple candidates using LLM-first approach and rank them.

    Uses asyncio.gather for parallel LLM calls when API key is available.
    """
    import asyncio

    tasks = [score_candidate_with_llm(c) for c in candidates]
    results = await asyncio.gather(*tasks)
    results = list(results)

    results.sort(key=lambda r: r.total_score, reverse=True)
    for i, result in enumerate(results):
        result.rank = i + 1
    return results


def score_batch(candidates: list[CandidateProfile]) -> list[ScoringResult]:
    """Score multiple candidates using heuristics and rank them."""
    results = [score_candidate(c) for c in candidates]
    results.sort(key=lambda r: r.total_score, reverse=True)
    for i, result in enumerate(results):
        result.rank = i + 1
    return results
