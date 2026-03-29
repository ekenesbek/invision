# Архитектура inVision U AI Screening

## Стек

| Слой | Технология |
|------|-----------|
| Frontend | React 18, Vite, Tailwind CSS v4, TypeScript |
| Backend | Python 3.11, FastAPI, Pydantic |
| Database | PostgreSQL 16, SQLAlchemy (async), AsyncPG |
| LLM | OpenAI API (gpt-4o-mini / gpt-4o / gpt-4.1) |
| NLP | Кастомный эвристический анализатор (50+ маркеров) |

## Схема

```
┌──────────────┐     ┌──────────────────────────────────┐     ┌────────────┐
│   React UI   │────▶│         FastAPI Backend           │────▶│ PostgreSQL │
│  :3000       │◀────│         :8000                     │◀────│  :5432     │
└──────────────┘     │                                    │     └────────────┘
                     │  ┌─────────────┐ ┌──────────────┐ │
                     │  │ Scoring     │ │ LLM Analyzer │──────▶ OpenAI API
                     │  │ Engine      │ │ (optional)   │ │
                     │  └─────────────┘ └──────────────┘ │
                     │  ┌─────────────┐ ┌──────────────┐ │
                     │  │ Text        │ │ Fairness     │ │
                     │  │ Analyzer    │ │ Audit        │ │
                     │  └─────────────┘ └──────────────┘ │
                     └──────────────────────────────────┘
```

## Скоринг: 6 критериев

| Критерий | Вес | Источник |
|----------|-----|----------|
| Лидерский потенциал | 25% | Эссе + Активности |
| Траектория роста | 20% | Эссе (challenge) |
| Мотивация и увлечённость | 20% | Эссе (motivation) |
| Вклад и влияние | 15% | Активности + Эссе |
| Аутентичность текста | 10% | AI-детекция (17 маркеров) |
| Академический профиль | 10% | GPA + Языки + Навыки |

## Два режима скоринга

```
Запрос на оценку
       │
       ▼
  LLM Active?
  ┌───┴───┐
  │ Да    │ Нет
  ▼       ▼
OpenAI  Эвристика
  │     (keywords)
  │       │
  ▼       ▼
Ответ   Ответ
  │       │
  └───┬───┘
      ▼
  ScoringResult
  (сохраняется в PostgreSQL)
```

**LLM-first**: OpenAI анализирует эссе → structured JSON → merge с эвристикой (activities, GPA). При ошибке — fallback на эвристику.

**Эвристика**: 50+ ключевых слов (RU/EN) по каждому критерию, textstat для читабельности, лексическое разнообразие.

## Рекомендации

| Балл | Рекомендация | Действие |
|------|-------------|----------|
| 75+ | Настоятельно рекомендован | → Одобрен |
| 55-74 | Рекомендован | → Одобрен |
| 35-54 | Требует рассмотрения | → Остаётся на рассмотрении |
| 0-34 | Не рекомендован | → Отклонён |

## База данных

```sql
candidates
├── id (PK)
├── full_name, age, city, school_name, gpa
├── essay_motivation, essay_leadership, essay_challenge
├── activities (JSON), languages (JSON), skills (JSON)
├── why_invision, future_goals, community_contribution
├── status: pending | approved | rejected
└── created_at, updated_at

scoring_results
├── id (PK, auto)
├── candidate_id (FK → candidates.id)
├── scoring_method: llm | heuristic
├── result_data (JSON — полный ScoringResult)
└── created_at
```

## API (ключевые endpoints)

| Метод | URL | Описание |
|-------|-----|----------|
| GET | `/api/candidates` | Все кандидаты + результаты |
| POST | `/api/candidates` | Добавить кандидата |
| PATCH | `/api/candidates/{id}/status` | Изменить статус |
| POST | `/api/candidates/{id}/score` | Оценить одного |
| POST | `/api/candidates/score-all` | Оценить всех + авто-распределение |
| POST | `/api/candidates/seed` | Загрузить демо-данные |
| GET/POST | `/api/config` | API ключ и модель |

## Структура проекта

```
backend/app/
├── main.py              # FastAPI app + lifespan
├── database.py          # SQLAlchemy async engine
├── crud.py              # CRUD операции
├── api/
│   ├── candidates.py    # Persistent CRUD endpoints
│   ├── routes.py        # Stateless scoring endpoints
│   ├── config.py        # Runtime config (API key, model)
│   └── demo.py          # Demo data endpoint
├── models/
│   ├── candidate.py     # Pydantic schemas
│   └── db_models.py     # SQLAlchemy ORM
├── services/
│   ├── scoring_engine.py # Оркестрация скоринга
│   ├── llm_analyzer.py   # OpenAI интеграция
│   ├── text_analyzer.py  # Эвристический NLP
│   ├── baseline_scorer.py # Наивный baseline
│   └── fairness.py       # Аудит справедливости
└── data/
    └── sample_candidates.py # 20 демо-профилей

frontend/src/
├── App.tsx              # Весь UI (single-file)
├── main.tsx             # React entry
└── index.css            # Tailwind + стили
```
