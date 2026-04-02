# InVision ML — Essay Authenticity Detector

Fine-tuned DistilBERT model for detecting AI-generated essays.

## Model
- **Base**: `distilbert-base-uncased`
- **Fine-tuned name**: `InVisionEssayDetector`
- **Task**: Binary classification (human vs ai_generated)
- **Dataset**: [HC3](https://huggingface.co/datasets/Hello-SimpleAI/HC3) (~40k samples)

## Структура

```
ml/
├── data/                   # Подготовленные датасеты (train.json, val.json)
├── model/
│   └── InVisionEssayDetector/  # Сохранённая модель
├── outputs/                # Чекпоинты и логи
├── scripts/
│   ├── prepare_data.py     # Загрузка и подготовка HC3
│   ├── train.py            # Fine-tuning
│   ├── infer.py            # Инференс / тест
│   └── run_pipeline.sh     # Всё одной командой
└── requirements.txt
```

## Запуск

### Всё одной командой
```bash
cd ml
bash scripts/run_pipeline.sh
```

### Пошагово
```bash
cd ml
pip install -r requirements.txt

# Загрузить датасет
python scripts/prepare_data.py

# Обучить модель
python scripts/train.py

# Протестировать
python scripts/infer.py --text "Your essay text here..."
```

## Вывод модели

```json
{
  "prediction": "human",
  "confidence": 0.94,
  "authenticity_score": 9.4,
  "probabilities": {
    "human": 0.9401,
    "ai_generated": 0.0599
  }
}
```

`authenticity_score` (0–10) используется напрямую в дашборде InVision.
