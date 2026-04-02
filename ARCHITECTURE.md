# Архитектура inVision U AI Screening

## Стек

| Слой | Технология |
|------|-----------|
| Frontend | React 18, Vite, Tailwind CSS v4, TypeScript, Framer Motion |
| Backend | Python 3.11, FastAPI, Pydantic |
| Database | PostgreSQL 16, SQLAlchemy (async), AsyncPG |
| LLM | OpenAI API (gpt-5.4 / gpt-5.4-mini / gpt-5.4-nano) |
| ML | Fine-tuned DistilBERT (InVisionEssayDetector) |
| NLP | Кастомный эвристический анализатор (50+ маркеров RU/EN) |
| Deploy | Docker Compose (3 сервиса) |

## Схема

```
┌──────────────┐     ┌──────────────────────────────────────┐     ┌────────────┐
│   React UI   │────▶│         FastAPI Backend               │────▶│ PostgreSQL │
│  :3000       │◀────│         :8000                         │◀────│  :5432     │
└──────────────┘     │                                        │     └────────────┘
                     │  ┌──────────────┐ ┌────────────────┐  │
                     │  │ Scoring      │ │ LLM Analyzer   │──────▶ OpenAI API
                     │  │ Engine       │ │ (optional)     │  │
                     │  └──────────────┘ └────────────────┘  │
                     │  ┌──────────────┐ ┌────────────────┐  │
                     │  │ ML Detector  │ │ Text Analyzer  │  │
                     │  │ DistilBERT   │ │ 50+ markers    │  │
                     │  └──────────────┘ └────────────────┘  │
                     │  ┌──────────────┐ ┌────────────────┐  │
                     │  │ Fairness     │ │ Baseline       │  │
                     │  │ Audit        │ │ Scorer         │  │
                     │  └──────────────┘ └────────────────┘  │
                     │  ┌──────────────────────────────────┐  │
                     │  │ Talent Scrapers (6 источников)   │  │
                     │  │ IMO, IOI, IPhO, IChO, IZhO, CF  │  │
                     │  └──────────────────────────────────┘  │
                     └────────────────────────────────────────┘
```

## Скоринг: 6 критериев

| Критерий | Вес | Источник |
|----------|-----|----------|
| Лидерский потенциал | 25% | LLM эссе (70%) + Heuristic активности (30%) |
| Траектория роста | 20% | Эссе (challenge) |
| Мотивация и увлечённость | 20% | Эссе (motivation) |
| Вклад и влияние | 15% | Активности + Эссе |
| Аутентичность текста | 10% | ML (40%) + LLM (40%) + Heuristic (20%) |
| Академический профиль | 10% | GPA + Языки + Навыки (heuristic) |

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
Merge   Ответ
(70/30)   │
  │       │
  └───┬───┘
      ▼
  ScoringResult
  (сохраняется в PostgreSQL)
```

**LLM-first**: OpenAI анализирует эссе → structured JSON → merge с эвристикой (activities, GPA). При ошибке — fallback на эвристику.

**Эвристика**: 50+ ключевых слов (RU/EN) по каждому критерию, textstat для читабельности, лексическое разнообразие.

## AI-детекция (3 слоя)

```
Текст эссе
     │
     ├──▶ ML (DistilBERT)  ──▶ ai_prob (40%)
     ├──▶ LLM (OpenAI)     ──▶ confidence (40%)
     └──▶ Heuristic        ──▶ ai_phrases + stats (20%)
                                    │
                                    ▼
                            Blended confidence
                            + Consensus bonus (+20% если ML и LLM согласны)
                                    │
                                    ▼
                            is_likely_ai_generated (threshold ≥ 0.4)
```

## Рекомендации

| Балл | Рекомендация | Авто-распределение |
|------|-------------|----------|
| 75+ | Настоятельно рекомендован | → Одобрен |
| 55-74 | Рекомендован | → Одобрен |
| 35-54 | Требует рассмотрения | → Остаётся на рассмотрении |
| 0-34 | Не рекомендован | → Отклонён |

Комиссия может изменить статус любого кандидата вручную (human-in-the-loop).

## База данных (7 таблиц)

```sql
users                    -- Администраторы
├── id, email, password_hash, created_at

sessions                 -- Сессии авторизации
├── token (PK), user_id, created_at

candidates               -- Кандидаты
├── id (PK), full_name, age, city, school_name, gpa
├── essay_motivation, essay_leadership, essay_challenge
├── activities (JSON), languages (JSON), skills (JSON)
├── video_transcript, why_invision, future_goals, community_contribution
├── status: pending | approved | rejected
└── created_at, updated_at

scoring_results          -- Результаты оценки
├── id (PK, auto)
├── candidate_id (FK → candidates.id)
├── scoring_method: llm | heuristic
├── result_data (JSON — полный ScoringResult)
└── created_at

chat_messages            -- AI-чат по кандидатам
├── id (PK), candidate_id, role (user/assistant), content, created_at

talents                  -- Найденные таланты (скрейпинг)
├── id (PK), source, external_id, full_name, country, city
├── organization, achievements (JSON), profile_url
├── raw_data (JSON), ai_profile (JSON)
├── status: discovered | contacted | applied | ignored
└── scraped_at, updated_at

app_settings             -- Настройки приложения (API ключи)
├── key (PK), value, updated_at
```

## API (30+ endpoints)

### Скоринг (stateless)

| Метод | URL | Описание |
|-------|-----|----------|
| POST | `/api/score` | Оценить одного (LLM-first) |
| POST | `/api/score/heuristic` | Оценить одного (только эвристика) |
| POST | `/api/score/batch` | Batch скоринг + ранжирование |
| POST | `/api/score/upload` | Загрузить JSON файл с кандидатами |
| GET | `/api/baseline/compare` | Baseline vs heuristic vs LLM |
| GET | `/api/fairness` | Fairness-аудит |
| GET | `/api/schema` | JSON-схема входных/выходных данных |

### Кандидаты (persistent)

| Метод | URL | Описание |
|-------|-----|----------|
| GET | `/api/candidates` | Список с результатами |
| POST | `/api/candidates` | Добавить кандидата |
| POST | `/api/candidates/bulk` | Bulk добавление |
| GET | `/api/candidates/{id}` | Получить кандидата |
| PATCH | `/api/candidates/{id}/status` | Изменить статус |
| DELETE | `/api/candidates/{id}` | Удалить |
| POST | `/api/candidates/{id}/score` | Оценить одного |
| POST | `/api/candidates/score-all` | Оценить всех + авто-распределение |

### AI-чат (human-in-the-loop)

| Метод | URL | Описание |
|-------|-----|----------|
| POST | `/api/candidates/{id}/ask` | Задать вопрос AI о кандидате |
| GET | `/api/candidates/{id}/chat` | История чата |
| DELETE | `/api/candidates/{id}/chat` | Очистить чат |

### ML-детектор

| Метод | URL | Описание |
|-------|-----|----------|
| POST | `/api/ml/detect` | Прямая ML-детекция на тексте |
| GET | `/api/ml/status` | Статус модели |

### Таланты (скрейпинг)

| Метод | URL | Описание |
|-------|-----|----------|
| GET | `/api/talents` | Список найденных талантов |
| GET | `/api/talents/stats` | Статистика по источникам |
| POST | `/api/talents/scrape` | Запустить скрейпинг |
| POST | `/api/talents/{id}/enrich` | AI-обогащение профиля |
| POST | `/api/talents/enrich-all` | Bulk обогащение |
| PATCH | `/api/talents/{id}/status` | Изменить статус |

### Конфигурация и auth

| Метод | URL | Описание |
|-------|-----|----------|
| GET/POST | `/api/config` | API ключ и модель |
| DELETE | `/api/config/key` | Удалить API ключ |
| POST | `/api/auth/login` | Авторизация |
| GET | `/api/auth/me` | Текущий пользователь |
| GET | `/api/health` | Health check |

## Docker

```yaml
services:
  postgres:   # PostgreSQL 16 + healthcheck
  backend:    # FastAPI + ML model (context: root)
  frontend:   # React build → Nginx (proxy /api → backend)
```

Запуск: `docker compose up --build`

## Структура проекта

```
backend/app/
├── main.py               # FastAPI app + lifespan + SPA serving
├── database.py           # SQLAlchemy async engine
├── crud.py               # CRUD операции
├── api/
│   ├── routes.py         # Stateless scoring endpoints
│   ├── candidates.py     # Persistent CRUD + AI-чат + batch
│   ├── talents.py        # Скрейпинг + enrichment
│   ├── config.py         # Runtime config (API key, model)
│   ├── auth.py           # Token-based аутентификация
│   └── demo.py           # Демо-данные
├── models/
│   ├── candidate.py      # Pydantic schemas (вход/выход)
│   └── db_models.py      # SQLAlchemy ORM (7 таблиц)
├── services/
│   ├── scoring_engine.py  # Оркестрация скоринга (LLM + heuristic)
│   ├── llm_analyzer.py    # OpenAI интеграция + системный промпт
│   ├── text_analyzer.py   # Эвристический NLP (50+ маркеров)
│   ├── ml_detector.py     # DistilBERT AI-детекция
│   ├── baseline_scorer.py # Наивный baseline
│   ├── fairness.py        # Аудит справедливости
│   └── scrapers/          # IMO, IOI, IPhO, IChO, IZhO, Codeforces
└── data/
    └── sample_candidates.py # 20 демо-профилей

frontend/src/
├── App.tsx               # Весь UI (dashboard, профили, чат, таланты)
├── components/ui/        # UI компоненты
├── lib/utils.ts          # Tailwind утилиты
├── main.tsx              # React entry
└── index.css             # Tailwind + стили

ml/
├── model/InVisionEssayDetector/  # Fine-tuned DistilBERT
├── scripts/                      # prepare_data, train, infer
├── requirements.txt
├── README.md
└── DOCS.md                       # Полная ML документация
```
