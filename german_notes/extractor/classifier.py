"""Classify parsed WhatsApp messages into vocabulary pairs or German sentences.

Vocab pair heuristic
--------------------
A message is treated as a vocabulary pair when it matches the pattern:

    <term> [= | - | <>] <translation>

After splitting, we identify which side is German using a combination of:
  - A set of high-frequency German function words
  - The presence of German-specific characters (ä, ö, ü, ß)
  - langdetect probability scores (with a fixed seed for reproducibility)

The pair is normalised so that `VocabPair.german` always holds the German term.
Typos are preserved as-is.

German sentence heuristic
-------------------------
A message is treated as a full German sentence when:
  - It does NOT match the vocab pair pattern
  - It contains at least 4 words
  - langdetect returns 'de' for the full text
"""

import re
from typing import Optional

from langdetect import DetectorFactory, LangDetectException, detect, detect_langs

from german_notes.core.models import GermanSentence, Message, VocabPair

# Fix seed for reproducible detection on short texts
DetectorFactory.seed = 0

# Matches "word = translation", "word - translation", or "word <> translation",
# with optional surrounding parens/brackets
_SEPARATOR_RE = re.compile(r"^\(?(.+?)\)?\s*(?:<>|[=\-])\s*\(?(.+?)\)?$")

_URL_RE = re.compile(r"https?://")

_MIN_SENTENCE_WORDS = 4

# German characters that strongly indicate the text is German
_GERMAN_CHARS = set("äöüßÄÖÜ")

# High-frequency German function words
_GERMAN_MARKERS = {
    "der", "die", "das", "ein", "eine", "einen", "einem", "einer", "eines",
    "ich", "du", "er", "sie", "es", "wir", "ihr",
    "ist", "sind", "war", "bist", "bin", "wird", "werden",
    "nicht", "und", "oder", "aber", "auch", "noch", "schon",
    "mit", "von", "zu", "an", "auf", "in", "bei", "nach", "aus",
    "haben", "sein", "können", "müssen", "wollen", "dürfen", "sollen",
    "dein", "mein", "ihr", "sein", "unser", "euer", "kein",
    "gut", "guten", "gute", "deutsch", "morgen",
}

# Common German word endings that are rare in other languages
_GERMAN_SUFFIXES = ("ig", "lich", "isch", "ung", "heit", "keit", "schaft", "chen", "lein")

# Germanic languages that are easily confused with German by langdetect.
# If a word is detected as one of these AND the other side is confirmed German,
# the pair should be rejected (both sides are likely German).
_GERMANIC_LANGS = {"nl", "af", "da", "sv", "no", "lb", "fy", "yi"}

# Minimum probability for German to be considered a candidate language
_GERMAN_PROB_THRESHOLD = 0.15


def _german_probability(text: str) -> float:
    """Return the langdetect probability that *text* is German (0.0–1.0)."""
    try:
        langs = detect_langs(text.strip())
        for lang in langs:
            if lang.lang == "de":
                return lang.prob
    except LangDetectException:
        pass
    return 0.0


def _looks_german(text: str) -> bool:
    """Return True if there is reasonable evidence that *text* is German."""
    # German-specific characters are a near-certain indicator
    if any(ch in _GERMAN_CHARS for ch in text):
        return True
    # High-frequency German function words
    words_lower = {w.lower().strip(".,!?()[]'\"/") for w in text.split()}
    if words_lower & _GERMAN_MARKERS:
        return True
    # Common German morphological suffixes (e.g. quirlig, freundlich, Reinigung)
    if any(w.endswith(_GERMAN_SUFFIXES) for w in words_lower if len(w) > 4):
        return True
    # langdetect probability above threshold
    return _german_probability(text) >= _GERMAN_PROB_THRESHOLD


def _detect_lang(text: str) -> str:
    try:
        return detect(text.strip())
    except LangDetectException:
        return "unknown"


def _try_vocab_pair(message: Message) -> Optional[VocabPair]:
    """Return a VocabPair if *message* matches the word = translation pattern."""
    text = message.text.strip()

    # Skip messages containing URLs — a hyphen inside a URL or title can
    # accidentally match the separator pattern
    if _URL_RE.search(text):
        return None

    # Must be a single line
    if "\n" in text:
        return None

    match = _SEPARATOR_RE.match(text)
    if not match:
        return None

    left, right = match.group(1).strip(), match.group(2).strip()

    # Both sides must be non-empty and short (long text is not a vocab pair)
    if not left or not right:
        return None
    if len(left.split()) > 6 or len(right.split()) > 6:
        return None

    left_german = _looks_german(left)
    right_german = _looks_german(right)

    # Skip if both sides look German (humorous/contextual German-only message)
    if left_german and right_german:
        return None

    if left_german:
        translation_lang = _detect_lang(right)
        # Reject if the translation also looks Germanic (both sides likely German)
        if translation_lang in _GERMANIC_LANGS:
            return None
        return VocabPair(
            german=left,
            translation=right,
            translation_lang=translation_lang,
            date=message.date,
            sender=message.sender,
            raw_message=message.text,
        )

    if right_german:
        translation_lang = _detect_lang(left)
        if translation_lang in _GERMANIC_LANGS:
            return None
        return VocabPair(
            german=right,
            translation=left,
            translation_lang=translation_lang,
            date=message.date,
            sender=message.sender,
            raw_message=message.text,
        )

    return None


def _try_german_sentence(message: Message) -> Optional[GermanSentence]:
    """Return a GermanSentence if *message* is a full German sentence."""
    text = message.text.strip()

    if _SEPARATOR_RE.match(text):
        return None

    words = text.split()
    if len(words) < _MIN_SENTENCE_WORDS:
        return None

    if _detect_lang(text) == "de":
        return GermanSentence(
            sentence=text,
            date=message.date,
            sender=message.sender,
        )

    return None


def classify(message: Message):
    """Return a VocabPair, GermanSentence, or None for *message*."""
    vocab = _try_vocab_pair(message)
    if vocab is not None:
        return vocab

    return _try_german_sentence(message)
