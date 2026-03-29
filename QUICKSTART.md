# inVision U — Quick Start

## Требования

- Python 3.11+
- Node.js 18+
- PostgreSQL (локальный или Docker)

## 1. PostgreSQL

**Локально:**
```bash
psql -U postgres -c "CREATE USER invision WITH PASSWORD 'invision';"
psql -U postgres -c "CREATE DATABASE invision OWNER invision;"
```

**Или Docker:**
```bash
docker compose up -d postgres
```

## 2. Backend

```bash
cd backend
cp .env.example .env          # вставить OPENAI_API_KEY (опционально)
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

При первом старте таблицы создаются автоматически.

## 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Откроется на `http://localhost:3000`

## 4. Первый запуск

1. Откройте `http://localhost:3000`
2. Демо-кандидаты загрузятся автоматически (20 профилей)
3. Перейдите в **Настройки** → вставьте OpenAI API ключ → выберите модель → переключите режим на **AI (LLM)**
4. Вернитесь в **Кандидаты** → нажмите **Оценить всех**
5. Кандидаты автоматически распределятся по вкладкам

## Без OpenAI

Система работает и без API ключа — в режиме эвристики (50+ ключевых маркеров RU/EN). LLM повышает точность, но не обязателен.

## API Docs

Swagger: `http://localhost:8000/docs`
