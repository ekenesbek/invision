"""NLP-based text analysis for candidate essays and responses."""

from __future__ import annotations

import math
import re
from collections import Counter


# Leadership and initiative indicators
LEADERSHIP_MARKERS = [
    "lead", "led", "founded", "organized", "initiated", "created", "built",
    "managed", "coordinated", "launched", "started", "established", "directed",
    "mentored", "coached", "inspired", "mobilized", "transformed", "pioneered",
    # Russian stems — using substrings to catch conjugations
    "организова", "основал", "руководи", "создал", "создала",
    "запустил", "запустила", "инициировал", "координировал", "возглавил",
    "наставля", "обучил", "обучила", "собрал", "собрала",
    "вдохновля", "построил", "построила", "разработа",
    "менторил", "менторила", "управлял", "управляла",
    "организую", "основала", "подготовил", "подготовила",
    "кружок", "команд", "волонтёр",
]

GROWTH_MARKERS = [
    "learned", "grew", "improved", "overcame", "adapted", "developed",
    "challenged", "struggled", "failed", "recovered", "resilient", "persevered",
    # Russian
    "научил", "преодолел", "развил", "вырос", "адаптировал", "справил",
    "трудност", "вызов", "ошибк", "провал", "сложно", "страшно",
    "не сдава", "продолжал", "продолжала", "привык", "пересчитал",
    "выучил", "самостоятельно", "усердн", "стыдно", "призна",
    "топливо", "мотивац", "превращать",
]

IMPACT_MARKERS = [
    "impact", "result", "achieved", "helped", "changed", "improved",
    "increased", "reduced", "contributed", "served", "volunteers",
    # Russian
    "результат", "достиг", "помог", "помогла", "изменил", "изменила",
    "улучшил", "улучшила", "вклад", "спас", "место",
    "семь", "участник", "заказ", "внедрен", "тенге",
    "данные", "школьник", "ребёнок", "детей", "людей",
    "город", "регион", "сообществ",
]

PASSION_MARKERS = [
    "passionate", "love", "dream", "vision", "believe", "mission",
    "purpose", "drive", "dedicate", "commit", "aspire", "eager",
    # Russian
    "мечта", "верю", "верила", "миссия", "стремлюсь", "посвятил",
    "увлечён", "хочу", "люблю", "вдохнов", "будущее",
    "создать", "запустить", "изменить", "масштабир",
    "доступн", "единственн", "возможност", "ценност",
]

# AI-generated text indicators
AI_INDICATORS_PHRASES = [
    "in today's rapidly",
    "in conclusion",
    "it is worth noting",
    "furthermore",
    "moreover",
    "in the realm of",
    "it is important to note",
    "plays a crucial role",
    "a testament to",
    "serves as a reminder",
    "in light of",
    "navigating the complexities",
    "multifaceted",
    "leverage",
    "tapestry",
    "underscores",
    "delve into",
    "landscape of",
    "paradigm",
    "holistic approach",
    "synergy",
    "в современном мире",
    "в заключение хотелось бы отметить",
    "немаловажным является",
    "в контексте вышеизложенного",
]


def count_marker_hits(text: str, markers: list[str]) -> tuple[int, list[str]]:
    """Count how many marker words/phrases appear in the text."""
    text_lower = text.lower()
    found = []
    for marker in markers:
        if marker in text_lower:
            found.append(marker)
    return len(found), found


def analyze_vocabulary_richness(text: str) -> float:
    """Type-token ratio as a simple lexical diversity metric."""
    words = re.findall(r"\w+", text.lower())
    if len(words) < 10:
        return 0.0
    unique = len(set(words))
    return unique / len(words)


def analyze_sentence_variety(text: str) -> float:
    """Measure variance in sentence length — low variance suggests AI."""
    sentences = re.split(r"[.!?]+", text)
    sentences = [s.strip() for s in sentences if len(s.strip()) > 3]
    if len(sentences) < 3:
        return 0.5
    lengths = [len(s.split()) for s in sentences]
    mean_len = sum(lengths) / len(lengths)
    variance = sum((l - mean_len) ** 2 for l in lengths) / len(lengths)
    std_dev = math.sqrt(variance)
    # Human text tends to have higher variance
    # Normalize: std_dev of 3-8 is typical for humans
    return min(std_dev / 8.0, 1.0)


def compute_text_depth(text: str) -> float:
    """Estimate the depth/specificity of writing.

    Specific details (names, numbers, places) indicate authentic writing.
    """
    if not text:
        return 0.0

    words = text.split()
    if len(words) < 20:
        return 0.2

    # Count specific details
    specificity_signals = 0

    # Numbers and dates
    numbers = re.findall(r"\b\d+\b", text)
    specificity_signals += min(len(numbers), 5)

    # Proper nouns (crude: capitalized words not at sentence start)
    sentences = re.split(r"[.!?]+", text)
    for sent in sentences:
        sent_words = sent.strip().split()
        for w in sent_words[1:]:
            if w and w[0].isupper() and len(w) > 2:
                specificity_signals += 1

    # Personal pronouns (first person — indicates personal narrative)
    first_person = len(re.findall(r"\b(I|my|me|we|our|я|мой|мне|мы|наш)\b", text, re.IGNORECASE))
    specificity_signals += min(first_person, 5)

    score = min(specificity_signals / 15.0, 1.0)
    return score


def detect_ai_generated(text: str) -> tuple[bool, float, list[str]]:
    """Heuristic AI-generated text detection.

    Returns (is_likely_ai, confidence, indicators).
    """
    if not text or len(text) < 50:
        return False, 0.0, []

    indicators = []
    score = 0.0

    # Check for known AI phrases
    text_lower = text.lower()
    ai_phrase_count = 0
    for phrase in AI_INDICATORS_PHRASES:
        if phrase in text_lower:
            ai_phrase_count += 1
            if ai_phrase_count <= 3:
                indicators.append(f"Обнаружена типичная AI-фраза: \"{phrase}\"")

    if ai_phrase_count >= 5:
        score += 0.50
        indicators.append(f"Найдено {ai_phrase_count} типичных AI-фраз — очень высокая вероятность")
    elif ai_phrase_count >= 3:
        score += 0.40
        indicators.append(f"Найдено {ai_phrase_count} типичных AI-фраз")
    elif ai_phrase_count >= 2:
        score += 0.25
        indicators.append(f"Найдено {ai_phrase_count} типичных AI-фраз")
    elif ai_phrase_count >= 1:
        score += 0.15

    # Low sentence length variance
    sent_variety = analyze_sentence_variety(text)
    if sent_variety < 0.25:
        score += 0.2
        indicators.append("Низкая вариативность длины предложений (типично для AI)")

    # Vocabulary too uniform / too rich for age group
    vocab_richness = analyze_vocabulary_richness(text)
    if vocab_richness > 0.85:
        score += 0.15
        indicators.append("Необычно высокое лексическое разнообразие")

    # Lack of specific personal details
    depth = compute_text_depth(text)
    if depth < 0.2:
        score += 0.15
        indicators.append("Мало конкретных личных деталей и примеров")

    # Too long and too well-structured for a student essay
    words = text.split()
    if len(words) > 500:
        paragraphs = text.count("\n\n") + text.count("\n")
        if paragraphs >= 4 and sent_variety < 0.3:
            score += 0.1
            indicators.append("Подозрительно структурированный длинный текст")

    confidence = min(score, 1.0)
    is_likely = confidence >= 0.4

    if not indicators:
        indicators.append("Признаков AI-генерации не обнаружено")

    return is_likely, confidence, indicators


class TextAnalysisResult:
    def __init__(
        self,
        leadership_score: float,
        growth_score: float,
        impact_score: float,
        passion_score: float,
        authenticity_score: float,
        depth_score: float,
        leadership_signals: list[str],
        growth_signals: list[str],
        impact_signals: list[str],
        passion_signals: list[str],
    ):
        self.leadership_score = leadership_score
        self.growth_score = growth_score
        self.impact_score = impact_score
        self.passion_score = passion_score
        self.authenticity_score = authenticity_score
        self.depth_score = depth_score
        self.leadership_signals = leadership_signals
        self.growth_signals = growth_signals
        self.impact_signals = impact_signals
        self.passion_signals = passion_signals


def analyze_essays(
    essay_motivation: str,
    essay_leadership: str,
    essay_challenge: str,
    video_transcript: str = "",
    why_invision: str = "",
    future_goals: str = "",
    community_contribution: str = "",
) -> TextAnalysisResult:
    """Analyze all candidate text inputs and return dimension scores."""

    all_text = " ".join([
        essay_motivation, essay_leadership, essay_challenge,
        video_transcript, why_invision, future_goals, community_contribution,
    ])

    if not all_text.strip():
        return TextAnalysisResult(0, 0, 0, 0, 50, 0, [], [], [], [])

    # Leadership
    lead_count, lead_found = count_marker_hits(all_text, LEADERSHIP_MARKERS)
    # Weight leadership essay more heavily
    lead_essay_count, lead_essay_found = count_marker_hits(essay_leadership, LEADERSHIP_MARKERS)
    leadership_score = min((lead_count * 8 + lead_essay_count * 12), 100)

    # Growth mindset
    growth_count, growth_found = count_marker_hits(all_text, GROWTH_MARKERS)
    challenge_depth = compute_text_depth(essay_challenge)
    growth_score = min(growth_count * 12 + challenge_depth * 40, 100)

    # Impact
    impact_count, impact_found = count_marker_hits(all_text, IMPACT_MARKERS)
    impact_score = min(impact_count * 12, 100)

    # Passion & motivation
    passion_count, passion_found = count_marker_hits(all_text, PASSION_MARKERS)
    motivation_depth = compute_text_depth(essay_motivation)
    passion_score = min(passion_count * 10 + motivation_depth * 40, 100)

    # Authenticity (inverse of AI detection)
    is_ai, ai_conf, _ = detect_ai_generated(all_text)
    authenticity_score = max((1.0 - ai_conf) * 100, 10)

    # Depth
    depth_score = compute_text_depth(all_text) * 100

    return TextAnalysisResult(
        leadership_score=leadership_score,
        growth_score=growth_score,
        impact_score=impact_score,
        passion_score=passion_score,
        authenticity_score=authenticity_score,
        depth_score=depth_score,
        leadership_signals=lead_found + lead_essay_found,
        growth_signals=growth_found,
        impact_signals=impact_found,
        passion_signals=passion_found,
    )
