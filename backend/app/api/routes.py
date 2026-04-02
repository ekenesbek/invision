"""API routes for the candidate scoring system."""

from __future__ import annotations

import json
import os

from fastapi import APIRouter, HTTPException, UploadFile, File

from ..data.sample_candidates import SAMPLE_CANDIDATES
from ..models.candidate import (
    ActivityEntry,
    BaselineComparison,
    BatchScoringRequest,
    BatchScoringResponse,
    CandidateProfile,
    ScoringResult,
)
from ..services.baseline_scorer import baseline_score_candidate
from ..services.fairness import compute_fairness_report
from ..services import ml_detector
from ..services.scoring_engine import (
    score_batch,
    score_batch_with_llm,
    score_candidate,
    score_candidate_with_llm,
)

router = APIRouter(prefix="/api", tags=["scoring"])


def _compute_batch_statistics(results: list[ScoringResult]) -> dict:
    """Compute statistics for a batch of scoring results."""
    avg_score = sum(r.total_score for r in results) / len(results) if results else 0
    score_distribution = {
        "strong_recommend": sum(1 for r in results if r.recommendation == "strong_recommend"),
        "recommend": sum(1 for r in results if r.recommendation == "recommend"),
        "review": sum(1 for r in results if r.recommendation == "review"),
        "not_recommended": sum(1 for r in results if r.recommendation == "not_recommended"),
    }
    ai_flagged = sum(1 for r in results if r.ai_detection.is_likely_ai_generated)

    return {
        "average_score": round(avg_score, 1),
        "score_distribution": score_distribution,
        "ai_flagged_count": ai_flagged,
        "highest_score": results[0].total_score if results else 0,
        "lowest_score": results[-1].total_score if results else 0,
    }


@router.post("/score", response_model=ScoringResult)
async def score_single_candidate(candidate: CandidateProfile):
    """Score a single candidate using LLM-first approach with heuristic fallback."""
    try:
        result = await score_candidate_with_llm(candidate)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Scoring error: {str(e)}")


@router.post("/score/heuristic", response_model=ScoringResult)
async def score_single_candidate_heuristic(candidate: CandidateProfile):
    """Score a single candidate using heuristic-only (no LLM)."""
    try:
        result = score_candidate(candidate)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Scoring error: {str(e)}")


@router.post("/score/batch", response_model=BatchScoringResponse)
async def score_multiple_candidates(request: BatchScoringRequest):
    """Score multiple candidates using LLM-first approach, rank them, and return statistics."""
    if not request.candidates:
        raise HTTPException(status_code=400, detail="No candidates provided")

    results = await score_batch_with_llm(request.candidates)

    shortlisted = sum(1 for r in results if r.recommendation in ("strong_recommend", "recommend"))

    return BatchScoringResponse(
        results=results,
        total_candidates=len(results),
        shortlisted=shortlisted,
        statistics=_compute_batch_statistics(results),
    )


@router.post("/score/batch/heuristic", response_model=BatchScoringResponse)
async def score_multiple_candidates_heuristic(request: BatchScoringRequest):
    """Score multiple candidates using heuristic-only (no LLM)."""
    if not request.candidates:
        raise HTTPException(status_code=400, detail="No candidates provided")

    results = score_batch(request.candidates)

    shortlisted = sum(1 for r in results if r.recommendation in ("strong_recommend", "recommend"))

    return BatchScoringResponse(
        results=results,
        total_candidates=len(results),
        shortlisted=shortlisted,
        statistics=_compute_batch_statistics(results),
    )


def _parse_candidate(data: dict) -> CandidateProfile:
    """Parse a raw dict into a CandidateProfile."""
    activities = [ActivityEntry(**a) for a in data.get("activities", [])]
    return CandidateProfile(**{**data, "activities": activities})


@router.post("/score/upload", response_model=BatchScoringResponse)
async def score_uploaded_file(file: UploadFile = File(...)):
    """Upload a JSON file with candidate profiles and score them all.

    The file should contain a JSON array of candidate objects.
    """
    if not file.filename or not file.filename.endswith(".json"):
        raise HTTPException(status_code=400, detail="Only .json files are supported")

    try:
        content = await file.read()
        raw = json.loads(content)
    except (json.JSONDecodeError, UnicodeDecodeError) as e:
        raise HTTPException(status_code=400, detail=f"Invalid JSON file: {str(e)}")

    if isinstance(raw, dict):
        raw = [raw]
    if not isinstance(raw, list):
        raise HTTPException(status_code=400, detail="JSON must be an array of candidate objects")

    candidates = []
    for i, item in enumerate(raw):
        try:
            candidates.append(_parse_candidate(item))
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Error parsing candidate #{i + 1}: {str(e)}")

    results = await score_batch_with_llm(candidates)
    shortlisted = sum(1 for r in results if r.recommendation in ("strong_recommend", "recommend"))

    return BatchScoringResponse(
        results=results,
        total_candidates=len(results),
        shortlisted=shortlisted,
        statistics=_compute_batch_statistics(results),
    )


@router.get("/baseline/compare", response_model=list[BaselineComparison])
async def compare_baselines():
    """Compare baseline, heuristic, and LLM scores for all demo candidates."""
    candidates = [_parse_candidate(c) for c in SAMPLE_CANDIDATES]

    comparisons = []
    for candidate in candidates:
        candidate_id = candidate.id or candidate.full_name

        # Baseline (simple rules)
        b_score = baseline_score_candidate(candidate)

        # Heuristic (keyword engine)
        heuristic_result = score_candidate(candidate)
        h_score = heuristic_result.total_score

        # LLM (try, may be None)
        try:
            llm_result = await score_candidate_with_llm(candidate)
            llm_score = llm_result.total_score if llm_result.scoring_method == "llm" else None
        except Exception:
            llm_score = None

        # Improvement: use the best available non-baseline score
        best_score = llm_score if llm_score is not None else h_score
        improvement = ((best_score - b_score) / b_score * 100) if b_score > 0 else 0.0

        comparisons.append(BaselineComparison(
            candidate_id=candidate_id,
            baseline_score=b_score,
            heuristic_score=h_score,
            llm_score=llm_score,
            improvement_over_baseline=round(improvement, 1),
        ))

    return comparisons


@router.get("/fairness")
async def get_fairness_report():
    """Run fairness audit on demo candidates."""
    candidates = [_parse_candidate(c) for c in SAMPLE_CANDIDATES]
    results = [score_candidate(c) for c in candidates]
    report = compute_fairness_report(candidates, results)
    return report


@router.get("/schema")
async def get_data_schema():
    """Return the full JSON schema for candidate input and scoring output.

    Useful for understanding the data contract and building integrations.
    """
    return {
        "input": {
            "candidate_profile": CandidateProfile.model_json_schema(),
            "activity_entry": ActivityEntry.model_json_schema(),
        },
        "output": {
            "scoring_result": ScoringResult.model_json_schema(),
            "batch_response": BatchScoringResponse.model_json_schema(),
        },
        "scoring_config": {
            "dimensions": {
                "leadership_potential": {"weight": 0.25, "label": "Лидерский потенциал"},
                "growth_trajectory": {"weight": 0.20, "label": "Траектория роста"},
                "motivation_passion": {"weight": 0.20, "label": "Мотивация и увлечённость"},
                "impact_contribution": {"weight": 0.15, "label": "Вклад и влияние"},
                "authenticity": {"weight": 0.10, "label": "Аутентичность текста"},
                "academic_profile": {"weight": 0.10, "label": "Академический профиль"},
            },
            "recommendations": {
                "strong_recommend": {"threshold": 75, "label": "Настоятельно рекомендован"},
                "recommend": {"threshold": 55, "label": "Рекомендован"},
                "review": {"threshold": 35, "label": "Требует рассмотрения"},
                "not_recommended": {"threshold": 0, "label": "Не рекомендован"},
            },
            "scoring_method": "llm" if os.getenv("OPENAI_API_KEY") else "heuristic",
        },
    }


def _generate_explanation(text: str, result: dict) -> list[str]:
    """Generate human-readable explanation of why the model classified text as human/AI."""
    signals = []
    prediction = result["prediction"]
    confidence = result["confidence"]
    ai_prob = result["ai_prob"]
    human_prob = result["human_prob"]

    # Analyze text characteristics
    sentences = [s.strip() for s in text.replace("!", ".").replace("?", ".").split(".") if s.strip()]
    words = text.split()
    avg_sentence_len = sum(len(s.split()) for s in sentences) / max(len(sentences), 1)
    sentence_lengths = [len(s.split()) for s in sentences]
    length_variance = (
        sum((l - avg_sentence_len) ** 2 for l in sentence_lengths) / max(len(sentence_lengths), 1)
    ) ** 0.5

    # Unique word ratio
    unique_ratio = len(set(w.lower() for w in words)) / max(len(words), 1)

    # Common AI patterns
    ai_phrases = [
        "в заключение", "таким образом", "следует отметить", "необходимо подчеркнуть",
        "важно отметить", "стоит отметить", "безусловно", "несомненно",
        "in conclusion", "furthermore", "moreover", "it is important to note",
        "in summary", "it is worth noting", "significantly", "consequently",
        "additionally", "nevertheless", "overall", "in today's world",
    ]
    found_ai_phrases = [p for p in ai_phrases if p.lower() in text.lower()]

    # Personal markers
    personal_markers = ["я ", "мне ", "мой ", "моя ", "мои ", "меня ", "i ", "my ", "me "]
    has_personal = any(m in text.lower() for m in personal_markers)

    if prediction == "ai_generated":
        if confidence > 0.95:
            signals.append(f"Модель определила текст как AI-сгенерированный с высокой уверенностью ({confidence*100:.1f}%)")
        else:
            signals.append(f"Модель склоняется к AI-генерации (уверенность {confidence*100:.1f}%)")

        if length_variance < 4:
            signals.append("Однородная длина предложений — типичный признак AI-генерации")
        if found_ai_phrases:
            signals.append(f"Обнаружены шаблонные AI-фразы: «{found_ai_phrases[0]}»")
        if unique_ratio < 0.55:
            signals.append("Низкое разнообразие лексики — повторяющийся словарный запас")
        if not has_personal:
            signals.append("Отсутствие личного опыта и конкретных деталей")
        if avg_sentence_len > 18:
            signals.append("Длинные, формально структурированные предложения")
    else:
        if confidence > 0.95:
            signals.append(f"Модель уверена, что текст написан человеком ({confidence*100:.1f}%)")
        else:
            signals.append(f"Модель склоняется к авторству человека (уверенность {confidence*100:.1f}%)")

        if has_personal:
            signals.append("Присутствует личный опыт и субъективная перспектива")
        if length_variance > 5:
            signals.append("Вариативная длина предложений — естественный стиль письма")
        if unique_ratio > 0.6:
            signals.append("Богатый и разнообразный словарный запас")
        if not found_ai_phrases:
            signals.append("Отсутствуют типичные AI-шаблоны и клише")
        if avg_sentence_len < 15:
            signals.append("Короткие, живые предложения — характерно для человека")

    return signals


@router.post("/ml/detect")
async def ml_detect_text(payload: dict):
    """Direct ML-based AI text detection on raw text.

    Body: {"text": "essay text..."}
    Returns ML model prediction with per-essay breakdown + explanation.
    """
    text = payload.get("text", "")
    if not text or len(text.strip()) < 30:
        raise HTTPException(status_code=400, detail="Text must be at least 30 characters")

    if not ml_detector.is_available():
        raise HTTPException(
            status_code=503,
            detail="ML model not available. Train it first: cd ml && python scripts/train.py"
        )

    result = ml_detector.predict(text)
    # Add explanation signals
    result["explanation"] = _generate_explanation(text, result)
    return result


@router.get("/ml/status")
async def ml_model_status():
    """Check ML model availability and info."""
    available = ml_detector.is_available()
    return {
        "ml_model": "InVisionEssayDetector",
        "available": available,
        "base_model": "distilbert-base-uncased" if available else None,
        "task": "AI-generated text detection (binary classification)" if available else None,
    }


@router.get("/health")
async def health_check():
    has_llm = bool(os.getenv("OPENAI_API_KEY"))
    has_ml = ml_detector.is_available()
    return {
        "status": "ok",
        "service": "inVision U AI Screening",
        "scoring_method": "llm" if has_llm else "heuristic",
        "llm_available": has_llm,
        "ml_model_available": has_ml,
    }
