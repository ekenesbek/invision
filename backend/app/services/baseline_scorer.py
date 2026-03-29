"""Dead-simple baseline scorer for comparison purposes.

Scores candidates using only three naive metrics:
- GPA (40% weight)
- Number of activities (30% weight)
- Essay word count (30% weight)

This exists purely to demonstrate improvement over a naive approach.
"""

from __future__ import annotations

from ..models.candidate import CandidateProfile


def baseline_score_candidate(candidate: CandidateProfile) -> float:
    """Score a candidate using only GPA, activity count, and essay word count.

    Returns a score from 0 to 100.
    """
    score = 0.0

    # GPA component: 40% weight, scaled from 0-5.0 to 0-100
    if candidate.gpa is not None:
        gpa_component = (candidate.gpa / 5.0) * 100
    else:
        gpa_component = 0.0
    score += gpa_component * 0.40

    # Activity count component: 30% weight
    # 0 activities = 0, 1 = 25, 2 = 50, 3 = 75, 4+ = 100
    activity_count = len(candidate.activities) if candidate.activities else 0
    activity_component = min(activity_count * 25, 100)
    score += activity_component * 0.30

    # Essay word count component: 30% weight
    # Combine all essays, target ~300+ words for full marks
    total_words = 0
    for text in [candidate.essay_motivation, candidate.essay_leadership, candidate.essay_challenge]:
        if text:
            total_words += len(text.split())
    # 0 words = 0, 100 words = 33, 200 words = 67, 300+ words = 100
    wordcount_component = min((total_words / 300) * 100, 100)
    score += wordcount_component * 0.30

    return round(score, 1)
