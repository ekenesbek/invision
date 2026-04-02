"""
Fine-tuning DistilBERT на задачу определения AI-сгенерированного текста.
Итоговая модель сохраняется как InVisionEssayDetector.

Запуск:
    python scripts/train.py
"""

import json
import os
from pathlib import Path

import evaluate
import numpy as np
import torch
from datasets import Dataset
from transformers import (
    AutoModelForSequenceClassification,
    AutoTokenizer,
    Trainer,
    TrainingArguments,
    DataCollatorWithPadding,
    EarlyStoppingCallback,
)

# ── Пути ──────────────────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).parent.parent
DATA_DIR = BASE_DIR / "data"
OUTPUT_DIR = BASE_DIR / "outputs"
MODEL_DIR = BASE_DIR / "model" / "InVisionEssayDetector"

OUTPUT_DIR.mkdir(exist_ok=True)
MODEL_DIR.mkdir(parents=True, exist_ok=True)

# ── Конфиг ────────────────────────────────────────────────────────────────────
BASE_MODEL = "distilbert-base-uncased"
MAX_LENGTH = 256  # токенов (баланс скорость/качество)
BATCH_SIZE = 16
EPOCHS = 3
LEARNING_RATE = 2e-5
LABEL_NAMES = ["human", "ai_generated"]


def load_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def main():
    # ── Данные ────────────────────────────────────────────────────────────────
    print("Загружаем данные...")
    train_data = load_json(DATA_DIR / "train.json")
    val_data = load_json(DATA_DIR / "val.json")

    # Ограничиваем для быстрого обучения (убери лимит для полного обучения)
    MAX_TRAIN = 20_000
    MAX_VAL = 3_000
    train_data = train_data[:MAX_TRAIN]
    val_data = val_data[:MAX_VAL]

    train_dataset = Dataset.from_list(train_data)
    val_dataset = Dataset.from_list(val_data)

    print(f"Train: {len(train_dataset)}, Val: {len(val_dataset)}")

    # ── Токенизатор ───────────────────────────────────────────────────────────
    print(f"Загружаем токенизатор: {BASE_MODEL}...")
    tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL)

    def tokenize(batch):
        return tokenizer(
            batch["text"],
            truncation=True,
            max_length=MAX_LENGTH,
            padding=False,
        )

    train_dataset = train_dataset.map(tokenize, batched=True, remove_columns=["text"])
    val_dataset = val_dataset.map(tokenize, batched=True, remove_columns=["text"])

    data_collator = DataCollatorWithPadding(tokenizer=tokenizer)

    # ── Модель ────────────────────────────────────────────────────────────────
    print("Загружаем модель...")
    device = (
        "mps" if torch.backends.mps.is_available()
        else "cuda" if torch.cuda.is_available()
        else "cpu"
    )
    print(f"Устройство: {device}")

    model = AutoModelForSequenceClassification.from_pretrained(
        BASE_MODEL,
        num_labels=2,
        id2label={0: "human", 1: "ai_generated"},
        label2id={"human": 0, "ai_generated": 1},
    )

    # ── Метрики ───────────────────────────────────────────────────────────────
    accuracy_metric = evaluate.load("accuracy")
    f1_metric = evaluate.load("f1")

    def compute_metrics(eval_pred):
        logits, labels = eval_pred
        predictions = np.argmax(logits, axis=-1)
        acc = accuracy_metric.compute(predictions=predictions, references=labels)
        f1 = f1_metric.compute(predictions=predictions, references=labels, average="macro")
        return {"accuracy": acc["accuracy"], "f1": f1["f1"]}

    # ── Обучение ──────────────────────────────────────────────────────────────
    training_args = TrainingArguments(
        output_dir=str(OUTPUT_DIR / "checkpoints"),
        num_train_epochs=EPOCHS,
        per_device_train_batch_size=BATCH_SIZE,
        per_device_eval_batch_size=BATCH_SIZE,
        learning_rate=LEARNING_RATE,
        weight_decay=0.01,
        eval_strategy="epoch",
        save_strategy="epoch",
        load_best_model_at_end=True,
        metric_for_best_model="f1",
        greater_is_better=True,
        logging_dir=str(OUTPUT_DIR / "logs"),
        logging_steps=100,
        report_to="none",  # без WandB
        fp16=False,  # MPS не поддерживает fp16
        dataloader_num_workers=0,
    )

    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_dataset,
        eval_dataset=val_dataset,
        tokenizer=tokenizer,
        data_collator=data_collator,
        compute_metrics=compute_metrics,
        callbacks=[EarlyStoppingCallback(early_stopping_patience=2)],
    )

    print("\nЗапускаем обучение...")
    trainer.train()

    # ── Сохраняем финальную модель ────────────────────────────────────────────
    print(f"\nСохраняем модель → {MODEL_DIR}")
    trainer.save_model(str(MODEL_DIR))
    tokenizer.save_pretrained(str(MODEL_DIR))

    # Сохраняем метаданные
    meta = {
        "model_name": "InVisionEssayDetector",
        "base_model": BASE_MODEL,
        "task": "binary classification: human vs ai_generated",
        "labels": {0: "human", 1: "ai_generated"},
        "max_length": MAX_LENGTH,
        "train_samples": len(train_dataset),
        "val_samples": len(val_dataset),
    }
    with open(MODEL_DIR / "model_card.json", "w") as f:
        json.dump(meta, f, indent=2)

    # Финальная оценка
    print("\nФинальная оценка на val...")
    results = trainer.evaluate()
    print(f"Accuracy: {results['eval_accuracy']:.4f}")
    print(f"F1:       {results['eval_f1']:.4f}")
    print(f"\nМодель сохранена: {MODEL_DIR}")


if __name__ == "__main__":
    main()
