"""Demo endpoint that loads sample candidates for showcase."""

from __future__ import annotations

from fastapi import APIRouter

from ..data.sample_candidates import SAMPLE_CANDIDATES
from ..models.candidate import ActivityEntry, BatchScoringResponse, CandidateProfile
from ..services.scoring_engine import score_batch

demo_router = APIRouter(prefix="/api/demo", tags=["demo"])


def _parse_candidate(data: dict) -> CandidateProfile:
    activities = [ActivityEntry(**a) for a in data.get("activities", [])]
    return CandidateProfile(**{**data, "activities": activities})


@demo_router.get("/candidates", response_model=BatchScoringResponse)
async def get_demo_results():
    """Return pre-scored sample candidates for demonstration."""
    candidates = [_parse_candidate(c) for c in SAMPLE_CANDIDATES]
    results = score_batch(candidates)

    shortlisted = sum(1 for r in results if r.recommendation in ("strong_recommend", "recommend"))
    avg_score = sum(r.total_score for r in results) / len(results)
    ai_flagged = sum(1 for r in results if r.ai_detection.is_likely_ai_generated)

    score_distribution = {
        "strong_recommend": sum(1 for r in results if r.recommendation == "strong_recommend"),
        "recommend": sum(1 for r in results if r.recommendation == "recommend"),
        "review": sum(1 for r in results if r.recommendation == "review"),
        "not_recommended": sum(1 for r in results if r.recommendation == "not_recommended"),
    }

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
