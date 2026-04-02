"""ML-based AI text detection using fine-tuned InVisionEssayDetector.

Loads the model once at import time and provides a predict() function
that returns authenticity scores for candidate essays.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# Model path — check multiple locations (local dev + Docker)
_base = Path(__file__).resolve().parent.parent.parent.parent
_candidates = [
    _base / "ml" / "model" / "InVisionEssayDetector",  # local dev
    Path("/app/ml/model/InVisionEssayDetector"),         # Docker
]
MODEL_DIR = next((p for p in _candidates if p.exists()), _candidates[0])

# Global model/tokenizer — loaded lazily on first call
_tokenizer = None
_model = None
_available = False


def _load_model():
    """Load the fine-tuned model (called once, lazily)."""
    global _tokenizer, _model, _available

    if not MODEL_DIR.exists():
        logger.warning(
            "ML model not found at %s. "
            "Run 'cd ml && python scripts/train.py' to train it. "
            "Falling back to heuristic AI detection.",
            MODEL_DIR,
        )
        _available = False
        return

    try:
        import torch
        from transformers import AutoModelForSequenceClassification, AutoTokenizer

        logger.info("Loading InVisionEssayDetector from %s ...", MODEL_DIR)
        _tokenizer = AutoTokenizer.from_pretrained(str(MODEL_DIR))
        _model = AutoModelForSequenceClassification.from_pretrained(str(MODEL_DIR))
        _model.eval()
        _available = True
        logger.info("InVisionEssayDetector loaded successfully.")
    except ImportError:
        logger.warning(
            "torch/transformers not installed. ML detector disabled. "
            "Install with: pip install torch transformers"
        )
        _available = False
    except Exception as e:
        logger.error("Failed to load ML model: %s", e)
        _available = False


def is_available() -> bool:
    """Check if the ML model is loaded and ready."""
    global _available, _tokenizer
    if _tokenizer is None and not _available:
        _load_model()
    return _available


def predict(text: str, max_length: int = 256) -> Optional[dict]:
    """Run ML-based AI detection on text.

    Returns:
        {
            "prediction": "human" | "ai_generated",
            "confidence": float (0-1),
            "human_prob": float,
            "ai_prob": float,
            "authenticity_score": float (0-100),
        }
        or None if the model is not available.
    """
    if not is_available():
        return None

    if not text or len(text.strip()) < 30:
        return None

    import torch

    inputs = _tokenizer(
        text,
        truncation=True,
        max_length=max_length,
        return_tensors="pt",
    )

    with torch.no_grad():
        outputs = _model(**inputs)
        probs = torch.softmax(outputs.logits, dim=-1).squeeze()

    human_prob = probs[0].item()
    ai_prob = probs[1].item()
    predicted_label = "human" if human_prob > ai_prob else "ai_generated"

    return {
        "prediction": predicted_label,
        "confidence": max(human_prob, ai_prob),
        "human_prob": round(human_prob, 4),
        "ai_prob": round(ai_prob, 4),
        "authenticity_score": round(human_prob * 100, 1),
    }


def predict_essays(
    essay_motivation: str = "",
    essay_leadership: str = "",
    essay_challenge: str = "",
) -> Optional[dict]:
    """Run ML detection on all essays combined, plus per-essay breakdown.

    Returns:
        {
            "overall": { prediction, confidence, authenticity_score, ... },
            "per_essay": {
                "motivation": { ... } | None,
                "leadership": { ... } | None,
                "challenge": { ... } | None,
            },
            "ml_authenticity_score": float (0-100),
        }
        or None if model is not available.
    """
    if not is_available():
        return None

    combined = " ".join([essay_motivation, essay_leadership, essay_challenge]).strip()
    if len(combined) < 30:
        return None

    overall = predict(combined)
    if overall is None:
        return None

    per_essay = {
        "motivation": predict(essay_motivation) if len(essay_motivation.strip()) > 30 else None,
        "leadership": predict(essay_leadership) if len(essay_leadership.strip()) > 30 else None,
        "challenge": predict(essay_challenge) if len(essay_challenge.strip()) > 30 else None,
    }

    return {
        "overall": overall,
        "per_essay": per_essay,
        "ml_authenticity_score": overall["authenticity_score"],
    }
