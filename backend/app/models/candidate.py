"""Pydantic models for candidate data and scoring results."""

from __future__ import annotations

from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class EducationLevel(str, Enum):
    SCHOOL = "school"
    COLLEGE = "college"
    BACHELOR = "bachelor"
    MASTER = "master"
    OTHER = "other"


class ActivityEntry(BaseModel):
    title: str = Field(..., description="Activity or achievement title")
    description: str = Field("", description="Details about the activity")
    role: str = Field("", description="Candidate's role (leader, participant, organizer, etc.)")
    year: Optional[int] = None
    impact: str = Field("", description="Measurable impact or result")


class CandidateProfile(BaseModel):
    id: Optional[str] = None
    full_name: str
    age: int = Field(..., ge=14, le=30)
    city: str = ""
    education_level: EducationLevel = EducationLevel.SCHOOL
    school_name: str = ""
    gpa: Optional[float] = Field(None, ge=0, le=5.0)

    # Free-text fields
    essay_motivation: str = Field("", description="Essay: why do you want to join inVision U?")
    essay_leadership: str = Field("", description="Essay: describe a time you led or initiated change")
    essay_challenge: str = Field("", description="Essay: describe your biggest challenge and how you overcame it")

    # Structured activities
    activities: list[ActivityEntry] = Field(default_factory=list)
    languages: list[str] = Field(default_factory=list)
    skills: list[str] = Field(default_factory=list)

    # Optional video/interview transcript
    video_transcript: str = Field("", description="Transcript of video presentation")

    # Self-reported
    why_invision: str = Field("", description="Short answer: what makes inVision U special to you?")
    future_goals: str = Field("", description="Where do you see yourself in 5 years?")
    community_contribution: str = Field("", description="How will you contribute to the inVision U community?")


class DimensionScore(BaseModel):
    name: str
    score: float = Field(..., ge=0, le=100)
    weight: float
    explanation: str
    key_signals: list[str] = Field(default_factory=list)


class AIDetectionResult(BaseModel):
    is_likely_ai_generated: bool = False
    confidence: float = Field(0.0, ge=0, le=1.0)
    indicators: list[str] = Field(default_factory=list)


class ScoringResult(BaseModel):
    candidate_id: str
    candidate_name: str
    total_score: float = Field(..., ge=0, le=100)
    rank: Optional[int] = None
    recommendation: str  # "strong_recommend", "recommend", "review", "not_recommended"
    recommendation_label: str
    dimensions: list[DimensionScore]
    ai_detection: AIDetectionResult
    summary: str
    strengths: list[str]
    areas_for_review: list[str]


class BatchScoringRequest(BaseModel):
    candidates: list[CandidateProfile]


class BatchScoringResponse(BaseModel):
    results: list[ScoringResult]
    total_candidates: int
    shortlisted: int
    statistics: dict
