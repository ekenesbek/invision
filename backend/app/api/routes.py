"""API routes for the candidate scoring system."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ..models.candidate import (
    BatchScoringRequest,
    BatchScoringResponse,
    CandidateProfile,
    ScoringResult,
)
from ..services.llm_analyzer import get_llm_analysis
from ..services.scoring_engine import score_batch, score_candidate

router = APIRouter(prefix="/api", tags=["scoring"])


@router.post("/score", response_model=ScoringResult)
async def score_single_candidate(candidate: CandidateProfile):
    """Score a single candidate and return detailed results with explanations."""
    try:
        result = score_candidate(candidate)

        # Try LLM enhancement (non-blocking, optional)
        llm_result = await get_llm_analysis(candidate)
        if llm_result:
            result.summary += f"\n\n📝 Качественный анализ AI: {llm_result.get('qualitative_summary', '')}"

        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Scoring error: {str(e)}")


@router.post("/score/batch", response_model=BatchScoringResponse)
async def score_multiple_candidates(request: BatchScoringRequest):
    """Score multiple candidates, rank them, and return statistics."""
    if not request.candidates:
        raise HTTPException(status_code=400, detail="No candidates provided")

    results = score_batch(request.candidates)

    shortlisted = sum(1 for r in results if r.recommendation in ("strong_recommend", "recommend"))
    avg_score = sum(r.total_score for r in results) / len(results)
    score_distribution = {
        "strong_recommend": sum(1 for r in results if r.recommendation == "strong_recommend"),
        "recommend": sum(1 for r in results if r.recommendation == "recommend"),
        "review": sum(1 for r in results if r.recommendation == "review"),
        "not_recommended": sum(1 for r in results if r.recommendation == "not_recommended"),
    }
    ai_flagged = sum(1 for r in results if r.ai_detection.is_likely_ai_generated)

    return BatchScoringResponse(
        results=results,
        total_candidates=len(results),
        shortlisted=shortlisted,
        statistics={
            "average_score": round(avg_score, 1),
            "score_distribution": score_distribution,
            "ai_flagged_count": ai_flagged,
            "highest_score": results[0].total_score if results else 0,
            "lowest_score": results[-1].total_score if results else 0,
        },
    )


@router.get("/health")
async def health_check():
    return {"status": "ok", "service": "inVision U AI Screening"}
