"""
Готовит казахский датасет для AI-детекции.

Стратегия:
1. Человеческие тексты: issai/kazqad-retrieval (800K passages из Kazakh Wikipedia)
2. AI-тексты: AmanMussa/kazakh-instruction-v2 (AI-generated responses)
   + генерация через OpenAI API для разнообразия
3. Объединяем с HC3 (английский) для мультиязычной модели

Запуск:
    PYTHONUNBUFFERED=1 python scripts/prepare_kazakh_data.py
"""

import json
import os
import random
import sys
import time
from pathlib import Path

# Force unbuffered output
sys.stdout.reconfigure(line_buffering=True) if hasattr(sys.stdout, 'reconfigure') else None

DATA_DIR = Path(__file__).parent.parent / "data"
DATA_DIR.mkdir(exist_ok=True)

SEED = 42
KZ_HUMAN_COUNT = 3000
KZ_AI_COUNT = 3000
MIN_LEN = 100
MAX_LEN = 2000

OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "http://51.195.200.207:8443/v1")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")


def flush_print(*args, **kwargs):
    print(*args, **kwargs, flush=True)


def load_kazakh_human_texts():
    """Load human-written Kazakh texts from Wikipedia articles."""
    flush_print("  Loading Kazakh texts from amandyk/kazakh_wiki_articles...")

    from datasets import load_dataset

    try:
        ds = load_dataset("amandyk/kazakh_wiki_articles", split="train",
                          verification_mode="no_checks")
        flush_print(f"  Wiki dataset loaded: {len(ds)} entries")
    except Exception as e:
        flush_print(f"  Wiki failed: {e}, trying alternative...")
        return load_kazakh_human_texts_alternative()

    texts = []
    for item in ds:
        text = (item.get("text") or item.get("content") or item.get("article") or "").strip()
        # Split long articles into paragraphs
        paragraphs = [p.strip() for p in text.split("\n\n") if len(p.strip()) >= MIN_LEN]
        for para in paragraphs:
            if MIN_LEN <= len(para) <= MAX_LEN:
                texts.append(para[:MAX_LEN])
            if len(texts) >= KZ_HUMAN_COUNT:
                break
        if len(texts) >= KZ_HUMAN_COUNT:
            break
        if len(texts) % 500 == 0 and len(texts) > 0:
            flush_print(f"    ...collected {len(texts)} texts")

    flush_print(f"  Collected {len(texts)} Kazakh human texts")
    return texts


def load_kazakh_human_texts_alternative():
    """Fallback: use KazCulture dataset."""
    flush_print("  Loading Kazakh texts from issai/KazCulture...")

    from datasets import load_dataset

    try:
        ds = load_dataset("issai/KazCulture", split="train")
        flush_print(f"  KazCulture loaded: {len(ds)} entries")

        texts = []
        for item in ds:
            # Try multiple possible field names
            for field in ["passage", "context", "question", "answer", "text"]:
                text = (item.get(field) or "").strip()
                if MIN_LEN <= len(text) <= MAX_LEN:
                    texts.append(text[:MAX_LEN])
            if len(texts) >= KZ_HUMAN_COUNT:
                break

        flush_print(f"  Collected {len(texts)} Kazakh human texts (KazCulture)")
        return texts
    except Exception as e:
        flush_print(f"  KazCulture failed: {e}")
        return []


def load_kazakh_ai_texts_from_instructions():
    """Load AI-generated Kazakh text from instruction dataset."""
    flush_print("  Loading AI texts from AmanMussa/kazakh-instruction-v2...")

    from datasets import load_dataset

    ds = load_dataset("AmanMussa/kazakh-instruction-v2", split="train", trust_remote_code=True)
    flush_print(f"  Dataset loaded: {len(ds)} entries")

    texts = []
    for item in ds:
        text = (item.get("output") or item.get("response") or "").strip()
        if MIN_LEN <= len(text) <= MAX_LEN:
            texts.append(text[:MAX_LEN])
        if len(texts) >= KZ_AI_COUNT:
            break

    flush_print(f"  Collected {len(texts)} AI texts from instructions")
    return texts


def generate_ai_kazakh_via_openai(human_texts: list[str], count: int = 500) -> list[str]:
    """Generate additional AI Kazakh texts via OpenAI for diversity."""
    api_key = OPENAI_API_KEY
    if not api_key:
        env_path = Path(__file__).parent.parent.parent / "backend" / ".env"
        if env_path.exists():
            for line in env_path.read_text().splitlines():
                if line.startswith("OPENAI_API_KEY="):
                    api_key = line.split("=", 1)[1].strip().strip('"')
                    break

    if not api_key:
        flush_print("  No OPENAI_API_KEY, skipping OpenAI generation")
        return []

    flush_print(f"  Generating {count} AI texts via OpenAI...")

    from openai import OpenAI
    client = OpenAI(api_key=api_key, base_url=OPENAI_BASE_URL)

    ai_texts = []
    batch_size = 5
    topics = [t.split(".")[0].strip() for t in human_texts if len(t.split(".")[0].strip()) > 20]
    random.shuffle(topics)

    for i in range(0, min(len(topics), count * 2), batch_size):
        if len(ai_texts) >= count:
            break

        batch_topics = topics[i:i + batch_size]
        prompt_topics = "\n".join(f"{j+1}. {t}" for j, t in enumerate(batch_topics))

        try:
            response = client.chat.completions.create(
                model="gpt-5.4-mini",
                messages=[
                    {"role": "system", "content": "Казақ тілінде мәтін жаз. Әр тақырып бойынша 100-300 сөз. Мәтіндерді === белгісімен бөл."},
                    {"role": "user", "content": f"Мына тақырыптар бойынша жаз:\n{prompt_topics}\n\nӘр мәтінді === бөл."},
                ],
                max_completion_tokens=2000,
                temperature=0.9,
            )
            parts = [p.strip() for p in response.choices[0].message.content.split("===") if len(p.strip()) > MIN_LEN]
            ai_texts.extend(parts)
            if len(ai_texts) % 20 < batch_size:
                flush_print(f"    ...generated {len(ai_texts)} AI texts")
            time.sleep(0.3)
        except Exception as e:
            flush_print(f"    API error: {e}")
            time.sleep(2)

    ai_texts = ai_texts[:count]
    flush_print(f"  Generated {len(ai_texts)} AI texts via OpenAI")
    return ai_texts


def load_hc3_english():
    """Load existing HC3 English data."""
    train_path = DATA_DIR / "train.json"
    val_path = DATA_DIR / "val.json"

    if train_path.exists() and val_path.exists():
        flush_print("  Loading existing HC3 data...")
        with open(train_path, encoding="utf-8") as f:
            train = json.load(f)
        with open(val_path, encoding="utf-8") as f:
            val = json.load(f)
        flush_print(f"  HC3: {len(train)} train + {len(val)} val")
        return train + val
    return []


def main():
    random.seed(SEED)

    flush_print("=" * 60)
    flush_print("Preparing multilingual dataset (KZ + EN)")
    flush_print("=" * 60)

    # 1. Kazakh human texts
    flush_print("\n1. Kazakh human texts:")
    kz_human = load_kazakh_human_texts()

    # 2. Kazakh AI texts (instruction dataset + OpenAI)
    flush_print("\n2. Kazakh AI texts:")
    kz_ai = load_kazakh_ai_texts_from_instructions()

    # Generate additional AI texts via OpenAI for diversity
    if len(kz_ai) < KZ_AI_COUNT:
        extra_count = KZ_AI_COUNT - len(kz_ai)
        flush_print(f"\n2b. Generating {extra_count} additional AI texts via OpenAI:")
        extra_ai = generate_ai_kazakh_via_openai(kz_human, extra_count)
        kz_ai.extend(extra_ai)

    # 3. English HC3 data
    flush_print("\n3. English data (HC3):")
    en_data = load_hc3_english()

    # 4. Combine
    flush_print("\n4. Combining data...")
    all_samples = []

    for text in kz_human:
        all_samples.append({"text": text, "label": 0, "lang": "kz"})
    for text in kz_ai:
        all_samples.append({"text": text, "label": 1, "lang": "kz"})

    # Balance EN with KZ
    en_limit = len(kz_human) + len(kz_ai)
    if en_data:
        random.shuffle(en_data)
        for item in en_data[:en_limit]:
            all_samples.append({"text": item["text"], "label": item["label"], "lang": "en"})

    random.shuffle(all_samples)

    # Split 90/10
    split = int(len(all_samples) * 0.9)
    train_samples = all_samples[:split]
    val_samples = all_samples[split:]

    # Save
    train_path = DATA_DIR / "train_multilingual.json"
    val_path = DATA_DIR / "val_multilingual.json"

    with open(train_path, "w", encoding="utf-8") as f:
        json.dump(train_samples, f, ensure_ascii=False, indent=2)
    with open(val_path, "w", encoding="utf-8") as f:
        json.dump(val_samples, f, ensure_ascii=False, indent=2)

    kz_h = sum(1 for s in all_samples if s["lang"] == "kz" and s["label"] == 0)
    kz_a = sum(1 for s in all_samples if s["lang"] == "kz" and s["label"] == 1)
    en_h = sum(1 for s in all_samples if s["lang"] == "en" and s["label"] == 0)
    en_a = sum(1 for s in all_samples if s["lang"] == "en" and s["label"] == 1)

    flush_print(f"\n{'=' * 60}")
    flush_print(f"Done!")
    flush_print(f"  Kazakh:  {kz_h} human + {kz_a} AI = {kz_h + kz_a}")
    flush_print(f"  English: {en_h} human + {en_a} AI = {en_h + en_a}")
    flush_print(f"  Total:   {len(all_samples)}")
    flush_print(f"  Train:   {len(train_samples)}, Val: {len(val_samples)}")
    flush_print(f"  Saved:   {train_path}, {val_path}")


if __name__ == "__main__":
    main()
