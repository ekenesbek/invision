"""Pydantic models for candidate data and scoring results.

Defines the complete data contract:
- CandidateProfile: input data from the application form
- ScoringResult: output of the AI scoring engine
- Supporting models: activities, dimensions, AI detection, etc.
"""

from __future__ import annotations

from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


# ─── Enums ───────────────────────────────────────────────

class EducationLevel(str, Enum):
    """Уровень образования кандидата."""
    SCHOOL = "school"
    COLLEGE = "college"
    BACHELOR = "bachelor"
    MASTER = "master"
    OTHER = "other"


# ─── Input: Application Data ────────────────────────────

class ActivityEntry(BaseModel):
    """Одна запись об активности / достижении кандидата.

    Пример:
        {
            "title": "Кружок робототехники",
            "description": "Основала и руковожу школьным кружком",
            "role": "Основатель и руководитель",
            "year": 2024,
            "impact": "40 участников, 2-е место на республиканской олимпиаде"
        }
    """
    title: str = Field(..., description="Название активности или достижения")
    description: str = Field("", description="Подробности об активности")
    role: str = Field("", description="Роль кандидата: лидер, участник, организатор и т.д.")
    year: Optional[int] = Field(None, description="Год активности")
    impact: str = Field("", description="Измеримый результат или влияние")


class CandidateProfile(BaseModel):
    """Полный профиль кандидата — входные данные из анкеты.

    Структура данных кандидата:
    ┌─────────────────────────────────────────────────┐
    │  1. АНКЕТНЫЕ ДАННЫЕ                             │
    │     id, full_name, age, city,                   │
    │     education_level, school_name, gpa           │
    ├─────────────────────────────────────────────────┤
    │  2. ЭССЕ (3 обязательных)                       │
    │     essay_motivation — Почему inVision U?        │
    │     essay_leadership — Опыт лидерства            │
    │     essay_challenge — Преодоление трудностей      │
    ├─────────────────────────────────────────────────┤
    │  3. АКТИВНОСТИ (массив ActivityEntry)            │
    │     title, description, role, year, impact      │
    ├─────────────────────────────────────────────────┤
    │  4. НАВЫКИ И ЯЗЫКИ                              │
    │     languages[], skills[]                       │
    ├─────────────────────────────────────────────────┤
    │  5. КОРОТКИЕ ОТВЕТЫ                             │
    │     why_invision, future_goals,                 │
    │     community_contribution                      │
    ├─────────────────────────────────────────────────┤
    │  6. ДОПОЛНИТЕЛЬНО                               │
    │     video_transcript (опционально)              │
    └─────────────────────────────────────────────────┘
    """

    # ── Анкетные данные ──
    id: Optional[str] = Field(None, description="Уникальный ID кандидата (например, K001)")
    full_name: str = Field(..., description="Полное имя кандидата")
    age: int = Field(..., ge=14, le=30, description="Возраст кандидата (14-30)")
    city: str = Field("", description="Город проживания")
    education_level: EducationLevel = Field(EducationLevel.SCHOOL, description="Уровень образования")
    school_name: str = Field("", description="Название учебного заведения")
    gpa: Optional[float] = Field(None, ge=0, le=5.0, description="Средний балл (0-5.0)")

    # ── Эссе (основной текстовый контент для анализа) ──
    essay_motivation: str = Field("", description="Эссе: почему вы хотите учиться в inVision U?")
    essay_leadership: str = Field("", description="Эссе: расскажите о ситуации, когда вы проявили лидерство")
    essay_challenge: str = Field("", description="Эссе: расскажите о самом сложном вызове и как вы его преодолели")

    # ── Активности и достижения ──
    activities: list[ActivityEntry] = Field(default_factory=list, description="Список активностей и достижений")
    languages: list[str] = Field(default_factory=list, description="Языки, которыми владеет кандидат")
    skills: list[str] = Field(default_factory=list, description="Навыки кандидата")

    # ── Дополнительно ──
    video_transcript: str = Field("", description="Транскрипт видео-презентации (опционально)")

    # ── Короткие ответы ──
    why_invision: str = Field("", description="Что делает inVision U особенным для вас?")
    future_goals: str = Field("", description="Кем вы видите себя через 5 лет?")
    community_contribution: str = Field("", description="Как вы внесёте вклад в сообщество inVision U?")


# ─── Output: Scoring Results ────────────────────────────

class DimensionScore(BaseModel):
    """Оценка по одному из 6 критериев скоринга.

    Критерии и веса:
    - Лидерский потенциал (25%)
    - Траектория роста (20%)
    - Мотивация и увлечённость (20%)
    - Вклад и влияние (15%)
    - Аутентичность текста (10%)
    - Академический профиль (10%)
    """
    name: str = Field(..., description="Название критерия")
    score: float = Field(..., ge=0, le=100, description="Балл по критерию (0-100)")
    weight: float = Field(..., description="Вес критерия (0-1)")
    explanation: str = Field(..., description="Объяснение оценки")
    key_signals: list[str] = Field(default_factory=list, description="Ключевые сигналы, обнаруженные в данных")


class AIDetectionResult(BaseModel):
    """Результат проверки эссе на AI-генерацию."""
    is_likely_ai_generated: bool = Field(False, description="Вероятно ли эссе написано AI")
    confidence: float = Field(0.0, ge=0, le=1.0, description="Уверенность детекции (0-1)")
    indicators: list[str] = Field(default_factory=list, description="Конкретные индикаторы AI-генерации")


class ScoringResult(BaseModel):
    """Полный результат оценки кандидата.

    Содержит:
    - Общий балл и ранг
    - Рекомендацию комиссии
    - Детализацию по 6 критериям
    - Результат AI-детекции
    - Резюме, сильные стороны и зоны для рассмотрения
    - Метод скоринга (LLM или эвристика)
    - LLM-анализ (если доступен)
    - Baseline-балл для сравнения
    """
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
    scoring_method: str = Field("heuristic", description="'llm' или 'heuristic'")
    llm_analysis: Optional[dict] = Field(None, description="Расширенный LLM-анализ: скрытые сильные стороны, вопросы для интервью")
    baseline_score: Optional[float] = Field(None, description="Baseline-балл (наивные правила) для сравнения")


# ─── Batch & Comparison Models ───────────────────────────

class BatchScoringRequest(BaseModel):
    """Запрос на пакетную оценку кандидатов."""
    candidates: list[CandidateProfile]


class BatchScoringResponse(BaseModel):
    """Ответ пакетной оценки: результаты + статистика."""
    results: list[ScoringResult]
    total_candidates: int
    shortlisted: int
    statistics: dict


class BaselineComparison(BaseModel):
    """Сравнение трёх методов скоринга для одного кандидата."""
    candidate_id: str
    baseline_score: float  # Наивные правила: GPA + активности + длина
    heuristic_score: float  # Эвристический движок (ключевые слова)
    llm_score: Optional[float] = None  # LLM-движок (если доступен)
    improvement_over_baseline: float  # Процент улучшения vs baseline
