"""Fairness and bias audit for the screening system.

Analyzes scoring distributions across cities, schools, and GPA ranges
to detect potential bias in the model's recommendations.
"""

from __future__ import annotations

from collections import defaultdict
from typing import Optional

from ..models.candidate import CandidateProfile, ScoringResult


def compute_fairness_report(
    candidates: list[CandidateProfile],
    results: list[ScoringResult],
) -> dict:
    """Compute fairness metrics across demographic groups.

    Groups by city, education type, and GPA range.
    Returns distribution statistics to surface potential bias.
    """
    # Build lookup: candidate_id -> (candidate, result)
    result_by_id = {r.candidate_id: r for r in results}
    pairs = []
    for c in candidates:
        cid = c.id or c.full_name
        if cid in result_by_id:
            pairs.append((c, result_by_id[cid]))

    report = {
        "total_candidates": len(pairs),
        "by_city": _group_stats(pairs, lambda c, _: c.city or "Не указан"),
        "by_school_type": _group_stats(pairs, _classify_school),
        "by_gpa_range": _group_stats(pairs, _classify_gpa),
        "score_distribution": _score_distribution(results),
        "recommendation_balance": _recommendation_balance(results),
        "bias_flags": _detect_bias_flags(pairs),
    }

    return report


def _classify_school(candidate: CandidateProfile, _: ScoringResult) -> str:
    """Classify school type: НИШ, specialized, or regular."""
    school = (candidate.school_name or "").lower()
    if "ниш" in school or "назарбаев" in school:
        return "НИШ"
    if any(kw in school for kw in ["лицей", "гимназия", "специализ"]):
        return "Лицей/Гимназия"
    return "Общеобразовательная"


def _classify_gpa(candidate: CandidateProfile, _: ScoringResult) -> str:
    """Classify GPA range."""
    if candidate.gpa is None:
        return "Не указан"
    if candidate.gpa >= 4.5:
        return "4.5-5.0 (отличник)"
    if candidate.gpa >= 3.5:
        return "3.5-4.4 (хорошист)"
    return "< 3.5"


def _group_stats(
    pairs: list[tuple[CandidateProfile, ScoringResult]],
    group_fn,
) -> list[dict]:
    """Compute per-group statistics."""
    groups: dict[str, list[float]] = defaultdict(list)
    for c, r in pairs:
        key = group_fn(c, r)
        groups[key].append(r.total_score)

    stats = []
    for name, scores in sorted(groups.items()):
        avg = sum(scores) / len(scores)
        mn = min(scores)
        mx = max(scores)
        stats.append({
            "group": name,
            "count": len(scores),
            "avg_score": round(avg, 1),
            "min_score": round(mn, 1),
            "max_score": round(mx, 1),
            "spread": round(mx - mn, 1),
        })

    return stats


def _score_distribution(results: list[ScoringResult]) -> dict:
    """Histogram-style distribution of scores."""
    buckets = {"0-20": 0, "20-40": 0, "40-60": 0, "60-80": 0, "80-100": 0}
    for r in results:
        s = r.total_score
        if s < 20:
            buckets["0-20"] += 1
        elif s < 40:
            buckets["20-40"] += 1
        elif s < 60:
            buckets["40-60"] += 1
        elif s < 80:
            buckets["60-80"] += 1
        else:
            buckets["80-100"] += 1
    return buckets


def _recommendation_balance(results: list[ScoringResult]) -> dict:
    """Count of each recommendation category."""
    counts: dict[str, int] = defaultdict(int)
    for r in results:
        counts[r.recommendation] += 1
    return dict(counts)


def _detect_bias_flags(pairs: list[tuple[CandidateProfile, ScoringResult]]) -> list[str]:
    """Flag potential biases in the scoring."""
    flags = []

    # Check if city strongly correlates with score
    city_scores: dict[str, list[float]] = defaultdict(list)
    for c, r in pairs:
        city_scores[c.city or "?"].append(r.total_score)

    city_avgs = {city: sum(s) / len(s) for city, s in city_scores.items() if len(s) >= 2}
    if city_avgs:
        max_city = max(city_avgs, key=city_avgs.get)  # type: ignore
        min_city = min(city_avgs, key=city_avgs.get)  # type: ignore
        gap = city_avgs[max_city] - city_avgs[min_city]
        if gap > 30:
            flags.append(
                f"Большой разброс средних баллов между городами: "
                f"{max_city} ({city_avgs[max_city]:.0f}) vs {min_city} ({city_avgs[min_city]:.0f}). "
                f"Проверьте, не связано ли это с качеством заявок, а не с предвзятостью."
            )

    # Check if GPA dominates the score
    high_gpa_low_score = []
    low_gpa_high_score = []
    for c, r in pairs:
        if c.gpa is not None:
            if c.gpa >= 4.5 and r.total_score < 40:
                high_gpa_low_score.append(c.full_name)
            if c.gpa < 3.5 and r.total_score >= 60:
                low_gpa_high_score.append(c.full_name)

    if low_gpa_high_score:
        flags.append(
            f"Система выявляет потенциал за пределами GPA: "
            f"{', '.join(low_gpa_high_score)} имеют GPA < 3.5, но высокий скоринг. "
            f"Это соответствует миссии inVision U."
        )

    if high_gpa_low_score:
        flags.append(
            f"Высокий GPA не гарантирует высокий балл: "
            f"{', '.join(high_gpa_low_score)} имеют GPA >= 4.5, но низкий скоринг. "
            f"Система оценивает лидерство и мотивацию, а не только академию."
        )

    if not flags:
        flags.append("Явных признаков систематической предвзятости не обнаружено.")

    return flags
