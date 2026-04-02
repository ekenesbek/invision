"""LLM-powered scoring and analysis using OpenAI-compatible API.

This module is the PRIMARY scorer when an API key is available.
When no key is configured, it returns None and the system falls back
to heuristic scoring. Zero errors in either mode.
"""

from __future__ import annotations

import json
import os
from typing import Optional

from ..models.candidate import CandidateProfile

INVISION_SYSTEM_PROMPT = """You are the AI scoring engine for inVision U — a selective university program in Kazakhstan that identifies high-potential young people based on leadership, growth mindset, motivation, real-world impact, and authenticity.

Your job is to score a candidate's application profile across multiple dimensions. You must evaluate holistically: not just grades, but the quality of thinking, depth of personal experience, evidence of initiative, and genuine passion.

SCORING CRITERIA (each dimension 0-100):

1. **leadership_potential** — Evidence of taking initiative, organizing others, founding projects, mentoring peers, leading teams. Look for concrete actions, not just claims. A 15-year-old who started a robotics club with measurable results scores higher than someone who merely says "I am a leader."

2. **growth_trajectory** — Signs of personal development, overcoming adversity, learning from failure, adaptability, resilience. Specificity matters: naming the exact challenge, describing the emotional journey, showing what changed.

3. **motivation_passion** — Genuine drive to join inVision U specifically. Understanding of the program's mission. Intrinsic motivation vs. extrinsic. Depth of connection to stated goals.

4. **impact_contribution** — Real-world results and contributions to community. Quantified outcomes (number of people helped, events organized, projects launched). Evidence of making a difference beyond oneself.

5. **authenticity** — Does the writing feel genuine and personal? Specific details (names, places, numbers, emotions) indicate real experience. Generic, polished, overly structured text may indicate AI generation. Personal voice and vulnerability score high.

6. **ai_detection** — Assess whether the essays appear to be AI-generated. Look for: overly uniform sentence length, generic phrasing, lack of personal specifics, AI-typical phrases ("in today's rapidly", "it is worth noting", "multifaceted"), unnaturally perfect structure.

SCORING GUIDELINES:
- 90-100: Exceptional, top 5% of applicants
- 75-89: Strong, clear evidence across multiple signals
- 55-74: Good, some evidence but gaps in depth or specificity
- 35-54: Below average, limited evidence or concerning signals
- 0-34: Weak, no meaningful evidence

Be calibrated and fair. A strong candidate from a small town with fewer opportunities but genuine initiative should score comparably to a privileged candidate with more resources but less personal drive.

Respond ONLY with valid JSON. No markdown, no code fences, no explanation outside the JSON."""

CANDIDATE_PROMPT_TEMPLATE = """Score this candidate's application:

Name: {full_name}
Age: {age}
City: {city}
Education: {education_level}
School: {school_name}
GPA: {gpa}
Languages: {languages}
Skills: {skills}

Activities:
{activities}

Essay — Motivation (why inVision U):
{essay_motivation}

Essay — Leadership:
{essay_leadership}

Essay — Overcoming Challenges:
{essay_challenge}

Video Transcript:
{video_transcript}

Why inVision U is special to you:
{why_invision}

Future Goals (5 years):
{future_goals}

How you will contribute to the community:
{community_contribution}

Return your assessment as JSON with this exact structure:
{{
    "leadership_potential": {{"score": <0-100>, "explanation": "<why this score>", "key_signals": ["<signal1>", "<signal2>"]}},
    "growth_trajectory": {{"score": <0-100>, "explanation": "<why this score>", "key_signals": ["<signal1>", "<signal2>"]}},
    "motivation_passion": {{"score": <0-100>, "explanation": "<why this score>", "key_signals": ["<signal1>", "<signal2>"]}},
    "impact_contribution": {{"score": <0-100>, "explanation": "<why this score>", "key_signals": ["<signal1>", "<signal2>"]}},
    "authenticity": {{"score": <0-100>, "explanation": "<why this score>", "key_signals": ["<signal1>", "<signal2>"]}},
    "ai_detection": {{"is_likely_ai": <true/false>, "confidence": <0.0-1.0>, "indicators": ["<indicator1>"]}},
    "qualitative_summary": "<2-3 sentence overall assessment>",
    "hidden_strengths": ["<strength not obvious from formal data>"],
    "concerns": ["<potential risk or area needing attention>"],
    "interview_questions": ["<recommended question for interview>"]
}}"""


def _format_activities(candidate: CandidateProfile) -> str:
    """Format activities list for the prompt."""
    if not candidate.activities:
        return "No activities listed."
    parts = []
    for a in candidate.activities[:8]:
        line = f"- {a.title}"
        if a.role:
            line += f" (role: {a.role})"
        if a.impact:
            line += f" — impact: {a.impact}"
        if a.description:
            line += f" | {a.description[:150]}"
        parts.append(line)
    return "\n".join(parts)


def _build_candidate_prompt(candidate: CandidateProfile) -> str:
    """Build the user prompt from candidate data."""
    return CANDIDATE_PROMPT_TEMPLATE.format(
        full_name=candidate.full_name,
        age=candidate.age,
        city=candidate.city or "Not specified",
        education_level=candidate.education_level.value,
        school_name=candidate.school_name or "Not specified",
        gpa=candidate.gpa if candidate.gpa is not None else "Not provided",
        languages=", ".join(candidate.languages) if candidate.languages else "Not specified",
        skills=", ".join(candidate.skills) if candidate.skills else "Not specified",
        activities=_format_activities(candidate),
        essay_motivation=candidate.essay_motivation[:2000] if candidate.essay_motivation else "Not provided",
        essay_leadership=candidate.essay_leadership[:2000] if candidate.essay_leadership else "Not provided",
        essay_challenge=candidate.essay_challenge[:2000] if candidate.essay_challenge else "Not provided",
        video_transcript=candidate.video_transcript[:1500] if candidate.video_transcript else "Not provided",
        why_invision=candidate.why_invision[:1000] if candidate.why_invision else "Not provided",
        future_goals=candidate.future_goals[:1000] if candidate.future_goals else "Not provided",
        community_contribution=candidate.community_contribution[:1000] if candidate.community_contribution else "Not provided",
    )


def _validate_llm_response(data: dict) -> bool:
    """Validate that the LLM response has the expected structure."""
    required_dimensions = [
        "leadership_potential", "growth_trajectory",
        "motivation_passion", "impact_contribution", "authenticity",
    ]
    for dim in required_dimensions:
        if dim not in data:
            return False
        dim_data = data[dim]
        if not isinstance(dim_data, dict):
            return False
        if "score" not in dim_data:
            return False
        score = dim_data["score"]
        if not isinstance(score, (int, float)) or score < 0 or score > 100:
            return False

    if "ai_detection" not in data:
        return False
    ai = data["ai_detection"]
    if not isinstance(ai, dict) or "is_likely_ai" not in ai:
        return False

    return True


async def llm_score_candidate(candidate: CandidateProfile) -> Optional[dict]:
    """Call OpenAI to get structured LLM scoring for a candidate.

    Returns a dict with dimension scores, ai_detection, qualitative_summary,
    hidden_strengths, concerns, and interview_questions.

    Returns None if no API key is configured or on any error.
    """
    from ..api.config import get_config

    cfg = get_config()
    api_key = cfg.get("openai_api_key") or os.getenv("OPENAI_API_KEY")
    model = cfg.get("model", "gpt-5.4-mini")

    if not api_key:
        return None

    try:
        from openai import AsyncOpenAI

        client = AsyncOpenAI(api_key=api_key)

        user_prompt = _build_candidate_prompt(candidate)

        response = await client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": INVISION_SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.2,
            max_completion_tokens=1500,
        )

        content = response.choices[0].message.content
        if not content:
            return None

        # Strip markdown code fences if present
        content = content.strip()
        if content.startswith("```"):
            content = content.split("\n", 1)[1] if "\n" in content else content[3:]
        if content.endswith("```"):
            content = content[:-3]
        content = content.strip()

        data = json.loads(content)

        if not _validate_llm_response(data):
            return None

        return data

    except Exception:
        return None


async def get_llm_analysis(candidate: CandidateProfile) -> Optional[dict]:
    """Get LLM-powered qualitative analysis of a candidate.

    Backward-compatible wrapper that calls llm_score_candidate internally.
    Returns None if no API key is configured or on any error.
    """
    result = await llm_score_candidate(candidate)
    if result is None:
        return None

    # Return the subset that the old interface expected
    return {
        "qualitative_summary": result.get("qualitative_summary", ""),
        "hidden_strengths": result.get("hidden_strengths", []),
        "concerns": result.get("concerns", []),
        "interview_questions": result.get("interview_questions", []),
    }
