"""Unit tests for the heuristic classifier.

Tests pick examples that hit the explicit heuristics (German characters,
function words, suffixes) so behaviour is deterministic regardless of
langdetect's confidence on short strings.
"""

from __future__ import annotations

from german_notes.core.models import GermanSentence, Message, VocabPair
from german_notes.extractor.classifier import (
    _looks_german,
    _try_german_sentence,
    _try_vocab_pair,
    classify,
)


def _msg(text: str) -> Message:
    return Message(date="01.01.24", sender="me", text=text)


# ── _looks_german ──────────────────────────────────────────────


def test_looks_german_detects_umlauts() -> None:
    assert _looks_german("Mädchen")
    assert _looks_german("Tür")
    assert _looks_german("schön")


def test_looks_german_detects_eszett() -> None:
    assert _looks_german("Straße")


def test_looks_german_detects_function_words() -> None:
    assert _looks_german("der Hund")
    assert _looks_german("ich bin")
    assert _looks_german("guten Morgen")


def test_looks_german_detects_morphological_suffixes() -> None:
    # "freundlich" → -lich, "Reinigung" → -ung
    assert _looks_german("freundlich")
    assert _looks_german("Reinigung")


def test_looks_german_rejects_clearly_english() -> None:
    assert not _looks_german("girl")
    assert not _looks_german("hello world")


# ── _try_vocab_pair ────────────────────────────────────────────


def test_vocab_pair_with_equals_separator() -> None:
    pair = _try_vocab_pair(_msg("Mädchen = girl"))
    assert isinstance(pair, VocabPair)
    assert pair.german == "Mädchen"
    assert pair.translation == "girl"


def test_vocab_pair_with_dash_separator() -> None:
    pair = _try_vocab_pair(_msg("Mädchen - girl"))
    assert isinstance(pair, VocabPair)
    assert pair.german == "Mädchen"


def test_vocab_pair_with_diamond_separator() -> None:
    pair = _try_vocab_pair(_msg("Mädchen <> girl"))
    assert isinstance(pair, VocabPair)
    assert pair.german == "Mädchen"


def test_vocab_pair_normalises_when_german_is_on_right() -> None:
    pair = _try_vocab_pair(_msg("girl = Mädchen"))
    assert isinstance(pair, VocabPair)
    assert pair.german == "Mädchen"
    assert pair.translation == "girl"


def test_vocab_pair_preserves_original_message() -> None:
    pair = _try_vocab_pair(_msg("Mädchen = girl"))
    assert isinstance(pair, VocabPair)
    assert pair.raw_message == "Mädchen = girl"
    assert pair.date == "01.01.24"
    assert pair.sender == "me"


def test_vocab_pair_rejects_url_lines() -> None:
    # A hyphen or `=` inside a URL should not trigger the pair pattern.
    assert _try_vocab_pair(_msg("https://example.com/foo-bar")) is None


def test_vocab_pair_rejects_multiline_text() -> None:
    assert _try_vocab_pair(_msg("Mädchen = girl\nzweite Zeile")) is None


def test_vocab_pair_rejects_long_sides() -> None:
    # Right side has > 6 words → not a vocab pair.
    long_translation = "a young person who identifies as female and is small"
    assert _try_vocab_pair(_msg(f"Mädchen = {long_translation}")) is None


def test_vocab_pair_rejects_when_both_sides_look_german() -> None:
    # Both contain German function words / characters.
    assert _try_vocab_pair(_msg("der Hund = die Katze")) is None


def test_vocab_pair_rejects_when_neither_side_looks_german() -> None:
    assert _try_vocab_pair(_msg("hello = hola")) is None


def test_vocab_pair_returns_none_without_separator() -> None:
    assert _try_vocab_pair(_msg("just a single phrase")) is None


# ── _try_german_sentence ───────────────────────────────────────


def test_german_sentence_detected() -> None:
    msg = _msg("Ich gehe heute Abend nach Hause.")
    result = _try_german_sentence(msg)
    assert isinstance(result, GermanSentence)
    assert result.sentence == "Ich gehe heute Abend nach Hause."
    assert result.sender == "me"


def test_german_sentence_rejects_text_matching_vocab_pattern() -> None:
    # Anything matching `<term> = <translation>` is left to the vocab path.
    assert _try_german_sentence(_msg("Mädchen = girl")) is None


def test_german_sentence_rejects_short_text() -> None:
    # Fewer than 4 words → not treated as a sentence even if German.
    assert _try_german_sentence(_msg("Ich bin müde")) is None


def test_german_sentence_rejects_non_german_text() -> None:
    assert _try_german_sentence(_msg("the quick brown fox jumps over the lazy dog")) is None


# ── classify (dispatch) ────────────────────────────────────────


def test_classify_prefers_vocab_pair_over_sentence() -> None:
    # If the message matches the vocab pattern, the vocab path wins.
    result = classify(_msg("Mädchen = girl"))
    assert isinstance(result, VocabPair)


def test_classify_falls_back_to_sentence() -> None:
    result = classify(_msg("Heute ist das Wetter wirklich sehr schön."))
    assert isinstance(result, GermanSentence)


def test_classify_returns_none_for_unrelated_text() -> None:
    assert classify(_msg("hi")) is None
