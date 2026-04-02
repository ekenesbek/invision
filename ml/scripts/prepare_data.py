"""
Загружает публичный датасет HC3 (Human ChatGPT Comparison Corpus)
напрямую через HuggingFace Hub API (JSONL файлы без loading script).

Датасет: Hello-SimpleAI/HC3
~40k образцов: человеческие ответы vs ChatGPT ответы
Label: 0 = human (authentic), 1 = AI-generated
"""

import json
import random
from pathlib import Path

from huggingface_hub import hf_hub_download

DATA_DIR = Path(__file__).parent.parent / "data"
DATA_DIR.mkdir(exist_ok=True)

# Используем subset для более быстрой загрузки
HC3_FILES = ["reddit_eli5.jsonl", "open_qa.jsonl", "wiki_csai.jsonl"]
SEED = 42


def download_and_parse():
    samples = []

    for filename in HC3_FILES:
        print(f"  Скачиваем {filename}...")
        local_path = hf_hub_download(
            repo_id="Hello-SimpleAI/HC3",
            filename=filename,
            repo_type="dataset",
        )

        with open(local_path, encoding="utf-8") as f:
            for line in f:
                if not line.strip():
                    continue
                item = json.loads(line)

                for answer in item.get("human_answers", []):
                    if answer and len(answer.strip()) > 50:
                        samples.append({"text": answer.strip()[:2000], "label": 0})

                for answer in item.get("chatgpt_answers", []):
                    if answer and len(answer.strip()) > 50:
                        samples.append({"text": answer.strip()[:2000], "label": 1})

    return samples


def main():
    print("Загружаем датасет HC3 с HuggingFace (JSONL)...")
    samples = download_and_parse()

    # Перемешиваем
    random.seed(SEED)
    random.shuffle(samples)

    # Train / Val split 90/10
    split = int(len(samples) * 0.9)
    train_samples = samples[:split]
    val_samples = samples[split:]

    train_path = DATA_DIR / "train.json"
    val_path = DATA_DIR / "val.json"

    with open(train_path, "w", encoding="utf-8") as f:
        json.dump(train_samples, f, ensure_ascii=False, indent=2)

    with open(val_path, "w", encoding="utf-8") as f:
        json.dump(val_samples, f, ensure_ascii=False, indent=2)

    human_train = sum(1 for s in train_samples if s["label"] == 0)
    ai_train = sum(1 for s in train_samples if s["label"] == 1)
    human_val = sum(1 for s in val_samples if s["label"] == 0)
    ai_val = sum(1 for s in val_samples if s["label"] == 1)

    print(f"\nГотово!")
    print(f"Train: {len(train_samples)} samples (human={human_train}, ai={ai_train})")
    print(f"Val:   {len(val_samples)} samples (human={human_val}, ai={ai_val})")
    print(f"Сохранено в {DATA_DIR}")


if __name__ == "__main__":
    main()
