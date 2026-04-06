"""
Fine-tuning XLM-RoBERTa на мультиязычную AI-детекцию (KZ + EN).

Базовая модель: xlm-roberta-base (100 языков, включая казахский)
Задача: бинарная классификация human vs ai_generated
Данные: HC3 (EN) + MDBKD/OpenAI (KZ)

Запуск:
    python scripts/train_multilingual.py
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

# ── Paths ─────────────────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).parent.parent
DATA_DIR = BASE_DIR / "data"
OUTPUT_DIR = BASE_DIR / "outputs"
MODEL_DIR = BASE_DIR / "model" / "InVisionEssayDetector"

OUTPUT_DIR.mkdir(exist_ok=True)
MODEL_DIR.mkdir(parents=True, exist_ok=True)

# ── Config ────────────────────────────────────────────────────────────────────
BASE_MODEL = "xlm-roberta-base"  # 100 languages including Kazakh
MAX_LENGTH = 256
BATCH_SIZE = 16
EPOCHS = 3
LEARNING_RATE = 2e-5
LABEL_NAMES = ["human", "ai_generated"]

# Use multilingual data if available, else fall back to original
TRAIN_FILE = "train_multilingual.json"
VAL_FILE = "val_multilingual.json"


def load_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def main():
    # ── Data ──────────────────────────────────────────────────────────────────
    print("Loading data...")

    train_path = DATA_DIR / TRAIN_FILE
    val_path = DATA_DIR / VAL_FILE

    # Fallback to original data if multilingual not ready
    if not train_path.exists():
        print(f"  {TRAIN_FILE} not found, falling back to train.json")
        train_path = DATA_DIR / "train.json"
        val_path = DATA_DIR / "val.json"

    train_data = load_json(train_path)
    val_data = load_json(val_path)

    # Cap for reasonable training time
    MAX_TRAIN = 30_000
    MAX_VAL = 5_000
    if len(train_data) > MAX_TRAIN:
        train_data = train_data[:MAX_TRAIN]
    if len(val_data) > MAX_VAL:
        val_data = val_data[:MAX_VAL]

    train_dataset = Dataset.from_list(train_data)
    val_dataset = Dataset.from_list(val_data)

    # Stats
    kz_train = sum(1 for d in train_data if d.get("lang") == "kz")
    en_train = sum(1 for d in train_data if d.get("lang", "en") == "en")
    print(f"Train: {len(train_dataset)} (KZ: {kz_train}, EN: {en_train})")
    print(f"Val:   {len(val_dataset)}")

    # ── Tokenizer ─────────────────────────────────────────────────────────────
    print(f"Loading tokenizer: {BASE_MODEL}...")
    tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL)

    def tokenize(batch):
        return tokenizer(
            batch["text"],
            truncation=True,
            max_length=MAX_LENGTH,
            padding=False,
        )

    # Remove extra columns (text, lang) after tokenization
    remove_cols = ["text"]
    if "lang" in train_dataset.column_names:
        remove_cols.append("lang")

    train_dataset = train_dataset.map(tokenize, batched=True, remove_columns=remove_cols)
    val_dataset = val_dataset.map(tokenize, batched=True, remove_columns=[c for c in remove_cols if c in val_dataset.column_names])

    data_collator = DataCollatorWithPadding(tokenizer=tokenizer)

    # ── Model ─────────────────────────────────────────────────────────────────
    print("Loading model...")
    device = (
        "mps" if torch.backends.mps.is_available()
        else "cuda" if torch.cuda.is_available()
        else "cpu"
    )
    print(f"Device: {device}")

    model = AutoModelForSequenceClassification.from_pretrained(
        BASE_MODEL,
        num_labels=2,
        id2label={0: "human", 1: "ai_generated"},
        label2id={"human": 0, "ai_generated": 1},
    )

    # ── Metrics ───────────────────────────────────────────────────────────────
    accuracy_metric = evaluate.load("accuracy")
    f1_metric = evaluate.load("f1")

    def compute_metrics(eval_pred):
        logits, labels = eval_pred
        predictions = np.argmax(logits, axis=-1)
        acc = accuracy_metric.compute(predictions=predictions, references=labels)
        f1 = f1_metric.compute(predictions=predictions, references=labels, average="macro")
        return {"accuracy": acc["accuracy"], "f1": f1["f1"]}

    # ── Training ──────────────────────────────────────────────────────────────
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
        report_to="none",
        fp16=False,  # MPS does not support fp16
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

    print(f"\nTraining {BASE_MODEL} for AI detection (KZ + EN)...")
    trainer.train()

    # ── Save ──────────────────────────────────────────────────────────────────
    print(f"\nSaving model -> {MODEL_DIR}")
    trainer.save_model(str(MODEL_DIR))
    tokenizer.save_pretrained(str(MODEL_DIR))

    # Model card
    meta = {
        "model_name": "InVisionEssayDetector",
        "base_model": BASE_MODEL,
        "task": "AI-generated text detection (binary classification)",
        "languages": ["en", "kz"],
        "labels": {0: "human", 1: "ai_generated"},
        "max_length": MAX_LENGTH,
        "train_samples": len(train_dataset),
        "val_samples": len(val_dataset),
    }
    with open(MODEL_DIR / "model_card.json", "w") as f:
        json.dump(meta, f, indent=2)

    # Final eval
    print("\nFinal evaluation...")
    results = trainer.evaluate()
    print(f"Accuracy: {results['eval_accuracy']:.4f}")
    print(f"F1:       {results['eval_f1']:.4f}")
    print(f"\nModel saved: {MODEL_DIR}")


if __name__ == "__main__":
    main()
