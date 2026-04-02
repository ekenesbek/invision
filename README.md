# inVision U — AI Screening System

Интеллектуальная система поддержки отбора кандидатов в inVision U.

> **Human-in-the-Loop**: Система является инструментом **поддержки** приёмной комиссии. Все оценки носят рекомендательный характер. Финальное решение принимает комиссия.

## Что делает система

Система принимает анкеты кандидатов (эссе, активности, академические данные) и возвращает:

- **Скоринг** по 6 критериям с весами (0–100 баллов)
- **Ранжирование** кандидатов от лучшего к худшему
- **Рекомендацию**: «Настоятельно рекомендован» / «Рекомендован» / «Требует рассмотрения» / «Не рекомендован»
- **Детекцию AI-генерации** в эссе (ML-модель DistilBERT + LLM-анализ + эвристики)
- **Объяснение** каждой оценки (Explainable AI) — ключевые сигналы, факторы, индикаторы
- **Baseline сравнение** — сколько выигрывает AI-скоринг vs наивные правила
- **Fairness-аудит** — распределение баллов по городам, школам, GPA-группам
- **Проактивный поиск талантов** — скрейпинг IMO, IOI, IPhO, IChO, IZhO, Codeforces
- **Интерактивный AI-чат** — задать вопросы о кандидате в контексте его профиля

## Архитектура

```
┌──────────────────────────────────────────────────────────┐
│             Frontend (React + Vite + Tailwind)            │
│  Dark-theme dashboard приёмной комиссии                    │
│  - Кандидаты: таблица + профиль + одобрение/отклонение    │
│  - Скоринг по 6 критериям с прогресс-барами               │
│  - AI-детекция (ML + LLM + эвристика)                     │
│  - AI-чат по кандидату                                    │
│  - Поиск талантов (олимпиадники)                          │
│  - ML Playground для тестирования детектора                │
│  - Импорт JSON / Экспорт CSV                             │
└───────────────────┬──────────────────────────────────────┘
                    │ REST API
┌───────────────────┴──────────────────────────────────────┐
│             Backend (FastAPI + PostgreSQL)                 │
│                                                           │
│  ┌──────────────────────────────────────────────────┐    │
│  │          Scoring Engine (LLM-first)               │    │
│  │  1. Try LLM (OpenAI gpt-5.4-mini)                │    │
│  │  2. Fallback: Heuristic keyword engine            │    │
│  │  3. Always compute: baseline score                │    │
│  └──────────────────────────────────────────────────┘    │
│                                                           │
│  ┌───────────────┐  ┌───────────────────────────────┐    │
│  │ ML Detector   │  │ Text Analyzer                  │    │
│  │ DistilBERT    │  │ 50+ RU/EN markers              │    │
│  │ fine-tuned    │  │ AI-фразы, вариативность        │    │
│  └───────────────┘  └───────────────────────────────┘    │
│                                                           │
│  ┌───────────────┐  ┌───────────────────────────────┐    │
│  │ LLM Analyzer  │  │ Fairness Audit                 │    │
│  │ OpenAI API    │  │ Bias по городам, школам, GPA    │    │
│  └───────────────┘  └───────────────────────────────┘    │
│                                                           │
│  ┌───────────────┐  ┌───────────────────────────────┐    │
│  │ Talent Scout  │  │ Baseline Scorer                │    │
│  │ 6 scrapers    │  │ GPA + activities + word count   │    │
│  └───────────────┘  └───────────────────────────────┘    │
│                                                           │
│  ┌──────────────────────────────────────────────────┐    │
│  │         PostgreSQL (7 таблиц)                     │    │
│  │  candidates, scoring_results, chat_messages,      │    │
│  │  talents, users, sessions, app_settings           │    │
│  └──────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────┘
```

## Scoring: LLM-first с Heuristic Fallback

Система использует **двухуровневую архитектуру** скоринга:

| Уровень | Метод | Когда работает |
|---------|-------|----------------|
| **LLM** | OpenAI gpt-5.4-mini | Если задан `OPENAI_API_KEY` |
| **Heuristic** | 50+ keyword markers (RU/EN) | Fallback, всегда доступен |
| **Baseline** | GPA + кол-во активностей + длина эссе | Всегда (для сравнения) |

Каждый результат содержит поле `scoring_method` ("llm" или "heuristic"), чтобы комиссия знала, какой движок выставил оценку.

## Критерии оценки (6 измерений)

| Критерий | Вес | Что анализируется |
|----------|-----|-------------------|
| Лидерский потенциал | 25% | Лидерские маркеры в эссе + роли в активностях |
| Траектория роста | 20% | Преодоление трудностей, адаптация, развитие |
| Мотивация и увлечённость | 20% | Страсть, цели, видение будущего |
| Вклад и влияние | 15% | Реальный impact + measurable результаты |
| Аутентичность текста | 10% | AI-детекция (ML + LLM + эвристики) |
| Академический профиль | 10% | GPA, языки, навыки |

## Детекция AI-генерации (3 слоя)

| Слой | Метод | Вес |
|------|-------|-----|
| **ML-модель** | Fine-tuned DistilBERT (InVisionEssayDetector) | 40% |
| **LLM-анализ** | OpenAI оценка аутентичности | 40% |
| **Эвристика** | 24+ AI-фраз, вариативность предложений, TTR, глубина текста | 20% |

Если оба слоя (ML + LLM) согласны — бонус +20% к уверенности.

## Проактивный поиск талантов

Система скрейпит публичные данные олимпиадников из Казахстана:
- **IMO** (Международная математическая олимпиада)
- **IOI** (Международная олимпиада по информатике)
- **IPhO** (Международная физическая олимпиада)
- **IChO** (Международная химическая олимпиада)
- **IZhO** (Жаутыковская олимпиада)
- **Codeforces** (рейтинг программистов)

Найденные таланты обогащаются AI-профилем (через LLM) и сохраняются в базу.

## Fairness & Bias Audit

Система анализирует распределение баллов по группам:
- **По городам** — выявление географического bias
- **По типу школы** — НИШ vs лицей vs СОШ
- **По GPA-диапазону** — корреляция GPA с итоговым баллом
- **Автоматические флаги** — предупреждения о потенциальных bias

API endpoint: `GET /api/fairness`

## Быстрый старт

### Docker (рекомендуется)

```bash
git clone https://github.com/ekenesbek/invision.git
cd invision
export OPENAI_API_KEY=sk-your-key-here  # опционально
docker compose up --build
```

- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- Swagger: http://localhost:8000/docs

### Локально

См. [QUICKSTART.md](QUICKSTART.md) для пошаговой инструкции.

## API Endpoints (основные)

| Метод | URL | Описание |
|-------|-----|----------|
| `POST` | `/api/score` | Оценить одного кандидата (LLM-first) |
| `POST` | `/api/score/batch` | Оценить и ранжировать нескольких кандидатов |
| `GET` | `/api/candidates` | Список кандидатов с результатами |
| `POST` | `/api/candidates` | Добавить кандидата |
| `POST` | `/api/candidates/score-all` | Оценить всех + авто-распределение |
| `PATCH` | `/api/candidates/{id}/status` | Изменить статус (human-in-the-loop) |
| `POST` | `/api/candidates/{id}/ask` | AI-чат по кандидату |
| `POST` | `/api/ml/detect` | Прямая ML-детекция AI-текста |
| `GET` | `/api/baseline/compare` | Baseline vs heuristic vs LLM |
| `GET` | `/api/fairness` | Fairness-аудит |
| `POST` | `/api/talents/scrape` | Скрейпинг олимпиадников |
| `GET` | `/api/health` | Health check |

Полная документация: http://localhost:8000/docs

## Датасет (20 кандидатов)

| Тип | Кол-во | Описание |
|-----|--------|----------|
| Strong (80-95) | 6 | Реальные лидеры с impact |
| Good (55-75) | 5 | Хорошие кандидаты с потенциалом |
| AI-generated | 4 | Эссе написаны ChatGPT — флагуются |
| Weak (20-40) | 3 | Минимальные заявки |
| Edge cases | 2 | Низкий GPA + высокий impact, и наоборот |

## Данные

Система использует **только данные из заявки кандидата**:
- Анкетные данные (возраст, город, образование, GPA)
- 3 эссе (мотивация, лидерство, преодоление трудностей)
- Активности и достижения с ролями и impact
- Навыки и языки
- Короткие ответы (почему inVision U, цели, вклад)

**Не используются**: демографические, расовые, социально-экономические данные, данные из соцсетей.

## Приватность и безопасность

- Данные обрабатываются локально (кроме опционального LLM-вызова)
- Нет сбора данных из социальных сетей
- Нет использования демографических признаков для скоринга
- Все оценки прозрачны и объяснимы
- Human-in-the-loop: система не принимает решений автономно
- Аутентификация: токен-сессии для доступа к панели

## Ограничения

- Без OpenAI API ключа работает только эвристический движок + ML-детектор
- Эвристический NLP оптимизирован для русского и английского
- AI-детекция — комбинированная (ML + LLM + эвристика), но не заменяет экспертную оценку
- Веса критериев настроены экспертно и могут требовать калибровки
- Датасет синтетический — для продакшена нужны реальные данные
- Видеоанализ — только текстовый транскрипт, нет анализа аудио/видео

## Стек технологий

| Компонент | Технология |
|-----------|-----------|
| Frontend | React 18, Vite, Tailwind CSS v4, TypeScript, Framer Motion |
| Backend | Python 3.11, FastAPI, Pydantic, SQLAlchemy (async) |
| Database | PostgreSQL 16, AsyncPG |
| LLM | OpenAI gpt-5.4-mini (опционально) |
| ML | Fine-tuned DistilBERT (InVisionEssayDetector) |
| NLP | Custom heuristic analyzer (RU/EN, 50+ markers) |
| Deploy | Docker Compose (PostgreSQL + Backend + Frontend) |

## Структура проекта

```
invision/
├── backend/
│   ├── app/
│   │   ├── main.py                # FastAPI app + lifespan
│   │   ├── database.py            # SQLAlchemy async engine
│   │   ├── crud.py                # CRUD операции
│   │   ├── api/
│   │   │   ├── routes.py          # Stateless scoring endpoints
│   │   │   ├── candidates.py      # CRUD + AI-чат + batch scoring
│   │   │   ├── talents.py         # Скрейпинг + enrichment
│   │   │   ├── config.py          # Runtime config (API key, model)
│   │   │   ├── auth.py            # Аутентификация
│   │   │   └── demo.py            # Демо-данные
│   │   ├── models/
│   │   │   ├── candidate.py       # Pydantic schemas
│   │   │   └── db_models.py       # SQLAlchemy ORM (7 таблиц)
│   │   ├── services/
│   │   │   ├── scoring_engine.py  # LLM-first scorer + fallback
│   │   │   ├── llm_analyzer.py    # OpenAI integration
│   │   │   ├── text_analyzer.py   # Heuristic NLP (50+ markers)
│   │   │   ├── ml_detector.py     # DistilBERT AI detection
│   │   │   ├── baseline_scorer.py # Naive baseline для сравнения
│   │   │   ├── fairness.py        # Bias audit
│   │   │   └── scrapers/          # IMO, IOI, IPhO, IChO, IZhO, Codeforces
│   │   └── data/
│   │       └── sample_candidates.py  # 20 демо-кандидатов
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── App.tsx                # Dashboard UI
│   │   ├── components/ui/         # UI компоненты
│   │   ├── lib/utils.ts           # Утилиты
│   │   ├── index.css              # Tailwind + стили
│   │   └── main.tsx               # React entry
│   ├── package.json
│   ├── Dockerfile
│   └── nginx.conf
├── ml/
│   ├── model/InVisionEssayDetector/  # Fine-tuned DistilBERT
│   ├── scripts/                      # train, infer, prepare_data
│   ├── requirements.txt
│   ├── README.md
│   └── DOCS.md                       # Полная ML документация
├── docker-compose.yml             # PostgreSQL + Backend + Frontend
├── Dockerfile                     # All-in-one образ
├── QUICKSTART.md
├── ARCHITECTURE.md
└── README.md
```
