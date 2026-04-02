"""
Инференс обученной модели InVisionEssayDetector.

Использование:
    python scripts/infer.py --text "Your essay text here..."
    python scripts/infer.py --file essay.txt
"""

import argparse
import json
from pathlib import Path

import torch
from transformers import AutoModelForSequenceClassification, AutoTokenizer

MODEL_DIR = Path(__file__).parent.parent / "model" / "InVisionEssayDetector"


def load_model():
    tokenizer = AutoTokenizer.from_pretrained(str(MODEL_DIR))
    model = AutoModelForSequenceClassification.from_pretrained(str(MODEL_DIR))
    model.eval()
    return tokenizer, model


def predict(text: str, tokenizer, model, max_length: int = 256) -> dict:
    inputs = tokenizer(
        text,
        truncation=True,
        max_length=max_length,
        return_tensors="pt",
    )

    with torch.no_grad():
        outputs = model(**inputs)
        probs = torch.softmax(outputs.logits, dim=-1).squeeze()

    human_prob = probs[0].item()
    ai_prob = probs[1].item()
    predicted_label = "human" if human_prob > ai_prob else "ai_generated"

    return {
        "prediction": predicted_label,
        "confidence": max(human_prob, ai_prob),
        "probabilities": {
            "human": round(human_prob, 4),
            "ai_generated": round(ai_prob, 4),
        },
        "authenticity_score": round(human_prob * 10, 2),  # 0–10 для дашборда
    }


def main():
    parser = argparse.ArgumentParser(description="InVisionEssayDetector inference")
    parser.add_argument("--text", type=str, help="Текст эссе напрямую")
    parser.add_argument("--file", type=str, help="Путь к файлу с эссе")
    args = parser.parse_args()

    if not args.text and not args.file:
        # Демо-пример
        sample_text = (
            "Growing up in a small town, I learned early that leadership isn't "
            "about having all the answers. When our school's science fair funding "
            "was cut, I organized a community bake sale and reached out to local "
            "businesses. We raised $800 in one weekend. That experience taught me "
            "that initiative means taking the first step even when you're unsure."
        )
        print("Демо-режим. Используем пример эссе.\n")
        text = sample_text
    elif args.file:
        with open(args.file, encoding="utf-8") as f:
            text = f.read()
    else:
        text = args.text

    print("Загружаем модель...")
    tokenizer, model = load_model()

    print(f"\nАнализируем текст ({len(text)} символов)...\n")
    result = predict(text, tokenizer, model)

    print("=" * 50)
    print(f"Предсказание:     {result['prediction']}")
    print(f"Уверенность:      {result['confidence']:.1%}")
    print(f"Authenticity score: {result['authenticity_score']}/10")
    print(f"\nВероятности:")
    print(f"  Human:        {result['probabilities']['human']:.4f}")
    print(f"  AI-generated: {result['probabilities']['ai_generated']:.4f}")
    print("=" * 50)
    print(f"\nJSON:\n{json.dumps(result, indent=2)}")


if __name__ == "__main__":
    main()
