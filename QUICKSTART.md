# inVision U — Quick Start

## Вариант 1: Docker (рекомендуется)

Запуск всего стека одной командой:

```bash
# Клонировать репозиторий
git clone https://github.com/ekenesbek/invision.git
cd invision

# (опционально) указать OpenAI ключ для LLM-режима
export OPENAI_API_KEY=sk-your-key-here

# Запустить всё
docker compose up --build
```

После запуска:
- **Frontend:** http://localhost:3000
- **Backend API:** http://localhost:8000
- **Swagger docs:** http://localhost:8000/docs

---

## Вариант 2: Локально по компонентам

### Требования

- Python 3.11+
- Node.js 18+
- PostgreSQL 16+

---

### 1. PostgreSQL

**Docker:**
```bash
docker compose up -d postgres
```

**Или вручную:**
```bash
psql -U postgres -c "CREATE USER invision WITH PASSWORD 'invision';"
psql -U postgres -c "CREATE DATABASE invision OWNER invision;"
```

---

### 2. Backend (FastAPI)

```bash
cd backend

# Создать виртуальное окружение
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

# Установить зависимости
pip install -r requirements.txt

# Настроить переменные окружения
cp .env.example .env
# Отредактировать .env — вставить OPENAI_API_KEY (опционально)

# Запустить сервер
uvicorn app.main:app --reload --port 8000
```

Backend доступен на http://localhost:8000

При первом запуске:
- Таблицы в PostgreSQL создаются автоматически
- ML-модель (InVisionEssayDetector) загружается из `ml/model/`
- Если модель недоступна — работает эвристика

---

### 3. Frontend (React + Vite)

```bash
cd frontend

# Установить зависимости
npm install

# Запустить dev-сервер
npm run dev
```

Frontend доступен на http://localhost:3000
API проксируется на backend автоматически (Vite proxy).

---

### 4. ML-модель (опционально, для обучения)

```bash
cd ml

python -m venv venv
source venv/bin/activate

pip install -r requirements.txt

# Полный пайплайн: скачать данные → обучить → проверить
bash scripts/run_pipeline.sh
```

Обученная модель сохраняется в `ml/model/InVisionEssayDetector/`.
Backend подхватит её при следующем запуске.

---

## Первый запуск

1. Откройте http://localhost:3000
2. Войдите: `yersain@gmail.com` / `invision2024`
3. Демо-кандидаты (20 профилей) загрузятся автоматически
4. **Настройки** → вставьте OpenAI API ключ → выберите модель → режим **AI (LLM)**
5. **Кандидаты** → **Оценить всех**
6. Кандидаты распределятся по вкладкам: одобрен / на рассмотрении / отклонён

## Без OpenAI

Система полностью работает без API ключа в режиме эвристики (50+ маркеров RU/EN + ML-детекция AI-текста). LLM повышает точность оценки эссе, но не обязателен.
