# InVision ML — Полная документация

## Содержание

1. [Обзор задачи](#1-обзор-задачи)
2. [Датасет HC3](#2-датасет-hc3)
3. [Архитектура модели](#3-архитектура-модели)
4. [Fine-tuning: как это работает](#4-fine-tuning-как-это-работает)
5. [Пайплайн обучения](#5-пайплайн-обучения)
6. [Структура кода](#6-структура-кода)
7. [Метрики и оценка](#7-метрики-и-оценка)
8. [Инференс](#8-инференс)
9. [Интеграция с backend](#9-интеграция-с-backend)
10. [Воспроизводимость и FAQ](#10-воспроизводимость-и-faq)

---

## 1. Обзор задачи

InVision оценивает эссе абитуриентов. Ключевая проблема — отличить **подлинное эссе** (написанное человеком) от **сгенерированного ИИ** (ChatGPT, Claude и т.д.).

**Формально:** бинарная классификация текста.

```
Вход:  строка (текст эссе)
Выход: { prediction: "human" | "ai_generated", authenticity_score: 0–10, ... }
```

Модель встраивается в scoring pipeline InVision и возвращает `authenticity_score`, который используется вместе с другими сигналами (GPA, активности, рекомендации).

---

## 2. Датасет HC3

**Название:** Human ChatGPT Comparison Corpus
**Источник:** [Hello-SimpleAI/HC3](https://huggingface.co/datasets/Hello-SimpleAI/HC3) на HuggingFace
**Формат:** JSONL

### Структура данных

Каждая запись в JSONL:
```json
{
  "id": "...",
  "question": "What causes inflation?",
  "human_answers": ["Inflation happens when..."],
  "chatgpt_answers": ["Inflation is a macroeconomic phenomenon..."]
}
```

Мы разворачиваем `human_answers → label=0` и `chatgpt_answers → label=1`.

### Используемые subset'ы

| Файл | Домен | Примеров |
|---|---|---|
| `reddit_eli5.jsonl` | Reddit ELI5 (объяснения простым языком) | ~45k |
| `open_qa.jsonl` | Открытые вопросы | ~5k |
| `wiki_csai.jsonl` | Компьютерные науки / AI | ~8k |

**Итого после обработки:**
- Train: ~66k образцов (human ≈ 71%, AI ≈ 29%)
- Val: ~7.3k образцов (те же пропорции, стратифицированно)

### Почему HC3, а не другие датасеты?

- Не требует Kaggle API — доступен напрямую через HuggingFace Hub
- Охватывает несколько доменов (важно для обобщаемости)
- Тексты сопоставимы по длине с реальными эссе (50–2000 символов)
- Peer-reviewed (опубликован на ACL 2023)

---

## 3. Архитектура модели

### Базовая модель: DistilBERT

```
distilbert-base-uncased
├── Embeddings (vocab_size=30522, hidden=768)
├── 6 × Transformer blocks
│   ├── Multi-head Self-Attention (12 heads)
│   ├── Feed-Forward (hidden=3072)
│   └── LayerNorm + Dropout
└── [CLS] token representation → Classification Head
                                  └── Linear(768 → 2)
```

**Почему DistilBERT?**
- 40% меньше параметров, чем BERT-base, при 97% его качества
- Быстро обучается на CPU/MPS (M1/M2 Mac)
- Достаточно для бинарной классификации текста
- Нативно поддерживает тексты до 512 токенов

### Classification head

Поверх DistilBERT добавлен линейный классификатор:
```
[CLS] embedding (768-dim)
    → Dropout(0.1)
    → Linear(768, 2)
    → Softmax
    → [P(human), P(ai_generated)]
```

---

## 4. Fine-tuning: как это работает

### Что такое fine-tuning

Предобученная модель (DistilBERT) уже понимает язык — она обучена на 8GB текста (Wikipedia + BookCorpus) задачей Masked Language Modeling. Fine-tuning **адаптирует** эти веса под нашу конкретную задачу.

```
Предобучение (MLM)                Fine-tuning (наша задача)
──────────────────                ─────────────────────────
Вход: "The [MASK] is round"       Вход: "Growing up I learned..."
Задача: угадать [MASK]            Задача: human или ai_generated?
Веса: общее понимание языка       Веса: специализируются под задачу
```

### Что именно меняется

При fine-tuning **все** веса модели обновляются, но:
- Нижние слои (близкие к embedding) изменяются слабо — они уже хорошо кодируют общие языковые паттерны
- Верхние слои (ближе к выходу) изменяются сильнее — они учатся извлекать признаки, специфичные для нашей задачи
- Classification head (Linear 768→2) обучается с нуля, так как его не было в базовой модели

### Loss function

Cross-Entropy Loss для бинарной классификации:

```
L = -[y · log(p) + (1-y) · log(1-p)]
```

где `y` — истинная метка (0 или 1), `p` — предсказанная вероятность.

### Оптимизатор

AdamW с линейным warmup (стандарт для трансформеров):
- `lr = 2e-5` — стандартный для fine-tuning BERT-подобных моделей
- `weight_decay = 0.01` — L2 регуляризация против переобучения
- Первые ~100 шагов: linear warmup (lr растёт от 0 до 2e-5)
- Далее: linear decay

---

## 5. Пайплайн обучения

### Запуск

```bash
cd ml

# Один раз — установить зависимости
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt

# Всё за один раз
bash scripts/run_pipeline.sh

# Или пошагово:
python scripts/prepare_data.py   # ~1 мин
python scripts/train.py          # ~20-40 мин CPU / ~5 мин MPS
python scripts/infer.py          # тест
```

### Гиперпараметры

| Параметр | Значение | Почему |
|---|---|---|
| `max_length` | 256 токенов | Баланс скорость / качество; большинство эссе < 256 токенов |
| `batch_size` | 16 | Стандарт для Mac M1/M2 (8GB RAM) |
| `epochs` | 3 | Обычно достаточно; EarlyStopping предотвратит переобучение |
| `learning_rate` | 2e-5 | Стандарт для BERT fine-tuning (из оригинальной статьи) |
| `MAX_TRAIN` | 20,000 | Ограничение для быстрого обучения; убери для полного |

### Early Stopping

Обучение останавливается автоматически если `f1` не улучшается 2 эпохи подряд. Загружаются лучшие веса.

---

## 6. Структура кода

```
ml/
├── data/
│   ├── train.json          # 66k образцов [{text, label}, ...]
│   └── val.json            # 7.3k образцов
│
├── model/
│   └── InVisionEssayDetector/
│       ├── config.json             # конфигурация модели
│       ├── model.safetensors       # веса модели
│       ├── tokenizer.json          # токенизатор
│       ├── tokenizer_config.json
│       ├── vocab.txt               # словарь (30522 токенов)
│       └── model_card.json         # метаданные (наш файл)
│
├── outputs/
│   ├── checkpoints/        # чекпоинты по эпохам
│   └── logs/               # логи обучения
│
├── scripts/
│   ├── prepare_data.py     # скачивает HC3, создаёт train/val JSON
│   ├── train.py            # fine-tuning, сохраняет модель
│   ├── infer.py            # CLI инференс
│   └── run_pipeline.sh     # запуск всего пайплайна
│
├── venv/                   # виртуальное окружение Python
├── requirements.txt        # зависимости
├── README.md               # быстрый старт
└── DOCS.md                 # этот файл
```

### prepare_data.py

1. Скачивает 3 JSONL файла из HC3 через `hf_hub_download`
2. Разворачивает `human_answers` и `chatgpt_answers` в плоский список
3. Обрезает тексты до 2000 символов
4. Перемешивает (`seed=42` для воспроизводимости)
5. Сохраняет `train.json` (90%) и `val.json` (10%)

### train.py

1. Загружает `train.json` и `val.json` как HuggingFace `Dataset`
2. Токенизирует тексты (`distilbert-base-uncased` tokenizer)
3. Загружает `AutoModelForSequenceClassification` с 2 метками
4. Настраивает `TrainingArguments` и `Trainer`
5. Обучает с `EarlyStoppingCallback`
6. Сохраняет лучшую модель в `model/InVisionEssayDetector/`
7. Выводит финальные `accuracy` и `f1`

### infer.py

1. Загружает модель из `model/InVisionEssayDetector/`
2. Токенизирует входной текст
3. Прогоняет через модель → softmax вероятности
4. Возвращает JSON с `prediction`, `confidence`, `authenticity_score`

---

## 7. Метрики и оценка

### Используемые метрики

**Accuracy** — доля правильных предсказаний:
```
accuracy = (TP + TN) / (TP + TN + FP + FN)
```

**F1 Macro** — гармоническое среднее precision и recall, усреднённое по классам:
```
F1 = 2 × (precision × recall) / (precision + recall)
```
Важно использовать именно macro F1 из-за дисбаланса классов (71% human vs 29% AI).

### Ожидаемые результаты

| Метрика | Ожидаемое значение |
|---|---|
| Accuracy | 0.88–0.93 |
| F1 Macro | 0.85–0.91 |

*Значения основаны на публичных бенчмарках HC3 с DistilBERT.*

---

## 8. Инференс

### CLI

```bash
# Текст напрямую
python scripts/infer.py --text "Growing up in a small town..."

# Из файла
python scripts/infer.py --file my_essay.txt

# Демо-пример
python scripts/infer.py
```

### Python API

```python
from scripts.infer import load_model, predict

tokenizer, model = load_model()

result = predict(
    text="Your essay text here...",
    tokenizer=tokenizer,
    model=model,
)

print(result)
# {
#   "prediction": "human",
#   "confidence": 0.94,
#   "authenticity_score": 9.4,   ← используется в дашборде (0–10)
#   "probabilities": {
#     "human": 0.9401,
#     "ai_generated": 0.0599
#   }
# }
```

### Интерпретация `authenticity_score`

| Score | Значение |
|---|---|
| 8–10 | Высокая вероятность подлинности |
| 5–8 | Неопределённо, требует ручной проверки |
| 0–5 | Высокая вероятность AI-генерации |

---

## 9. Интеграция с backend

Модель загружается один раз при старте сервера (не на каждый запрос):

```python
# backend/app/api/talents.py

from ml.scripts.infer import load_model, predict

# Глобальная загрузка при старте
_tokenizer, _model = load_model()

def score_essay(essay_text: str) -> dict:
    return predict(essay_text, _tokenizer, _model)
```

Результат `authenticity_score` добавляется к общему scoring JSON:
```json
{
  "overall_score": 82,
  "essay_authenticity": 9.1,
  "leadership_signal": 7.5,
  ...
}
```

---

## 10. Воспроизводимость и FAQ

### Как воспроизвести результат

```bash
# Фиксированный seed гарантирует одинаковый split
SEED = 42  # в prepare_data.py
```

Для полного воспроизведения также зафиксировать seed в train.py:
```python
import torch, random, numpy as np
torch.manual_seed(42)
np.random.seed(42)
random.seed(42)
```

### FAQ

**Q: Почему DistilBERT, а не GPT/LLaMA?**
A: DistilBERT достаточен для бинарной классификации. GPT-like модели избыточны и в 10–100x медленнее для инференса в продакшне.

**Q: Почему датасет несбалансирован (71% human)?**
A: Это отражает реальное соотношение в HC3. F1 Macro компенсирует дисбаланс в метриках. При необходимости можно добавить `class_weight` в loss.

**Q: Как дообучить на своих данных?**
A: Добавьте свои данные в `data/train.json` в формате `{"text": "...", "label": 0}`, затем запустите `python scripts/train.py`. Модель будет обучаться поверх уже fine-tuned весов.

**Q: Как обновить модель без переобучения с нуля?**
A: Добавьте новые данные, уменьшите `EPOCHS=1` в `train.py` и запустите снова — это incremental fine-tuning.

**Q: Сколько занимает инференс?**
A: ~10–50ms на один текст на CPU (M1 Mac). Для батч-обработки можно использовать `pipeline` из transformers.
