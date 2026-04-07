"""AutoGen-compatible tool functions and shared classify-and-store pipeline.

All classification flows through ``extractor.classifier.classify`` so there is
a single source of truth for deciding what is a vocab pair vs. a sentence.
"""

from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from typing import Any

from german_notes.api.supabase_client import get_supabase
from german_notes.core.models import GermanSentence, Message, VocabPair
from german_notes.extractor.classifier import classify
from german_notes.extractor.parser import parse_file
from german_notes.ocr.client import extract_from_image as ocr_extract


# ---------------------------------------------------------------------------
# Shared pipeline: classify lines -> store in Supabase
# ---------------------------------------------------------------------------

def _store_word_rows(
    vocab_pairs: list[VocabPair], source: str,
) -> int:
    if not vocab_pairs:
        return 0
    sb = get_supabase()

    word_rows = [
        {
            "german": vp.german,
            "source": source,
            "date": vp.date,
            "sender": vp.sender,
            "raw_message": vp.raw_message,
        }
        for vp in vocab_pairs
    ]
    word_res = sb.table("words").insert(word_rows).execute()

    translation_rows = []
    for vp, word_data in zip(vocab_pairs, word_res.data):
        lang = vp.translation_lang if vp.translation_lang in ("es", "en") else "es"
        translation_rows.append({
            "word_id": word_data["id"],
            "language": lang,
            "translation": vp.translation,
        })

    if translation_rows:
        sb.table("translations").insert(translation_rows).execute()

    return len(word_res.data)


def _store_text_rows(
    sentences: list[GermanSentence], source: str,
) -> int:
    if not sentences:
        return 0
    rows = [
        {
            "content": s.sentence,
            "source": source,
            "date": s.date,
            "sender": s.sender,
        }
        for s in sentences
    ]
    res = get_supabase().table("texts").insert(rows).execute()
    return len(res.data)


def classify_and_store(
    lines: list[str],
    source: str,
    sender: str = "",
) -> dict[str, Any]:
    """Classify raw text lines via ``classifier.py`` and persist results.

    Both the OCR and WhatsApp tools funnel through this function so that
    classification logic is never duplicated.
    """
    vocab_pairs: list[VocabPair] = []
    sentences: list[GermanSentence] = []

    for line in lines:
        msg = Message(date="", sender=sender, text=line)
        result = classify(msg)
        if isinstance(result, VocabPair):
            vocab_pairs.append(result)
        elif isinstance(result, GermanSentence):
            sentences.append(result)

    stored_words = _store_word_rows(vocab_pairs, source)
    stored_texts = _store_text_rows(sentences, source)

    return {
        "lines_received": len(lines),
        "words_classified": len(vocab_pairs),
        "texts_classified": len(sentences),
        "words_stored": stored_words,
        "texts_stored": stored_texts,
        "words_preview": [vp.german for vp in vocab_pairs[:5]],
    }


def classify_messages_and_store(
    messages: list[Message],
    source: str,
) -> dict[str, Any]:
    """Classify pre-parsed ``Message`` objects and persist results.

    Used by the WhatsApp tool where the parser already produces Message
    objects with date / sender metadata.
    """
    vocab_pairs: list[VocabPair] = []
    sentences: list[GermanSentence] = []

    for msg in messages:
        result = classify(msg)
        if isinstance(result, VocabPair):
            vocab_pairs.append(result)
        elif isinstance(result, GermanSentence):
            sentences.append(result)

    stored_words = _store_word_rows(vocab_pairs, source)
    stored_texts = _store_text_rows(sentences, source)

    return {
        "messages_parsed": len(messages),
        "words_classified": len(vocab_pairs),
        "texts_classified": len(sentences),
        "words_stored": stored_words,
        "texts_stored": stored_texts,
        "words_preview": [vp.german for vp in vocab_pairs[:5]],
    }


# ---------------------------------------------------------------------------
# AutoGen tool functions (called by the AssistantAgent)
# ---------------------------------------------------------------------------

async def store_words(entries: list[dict[str, str]]) -> str:
    """Store one or more German words with their translations.

    Each entry must have keys ``german`` and ``translation``.
    Optional: ``translation_lang`` ("es" or "en"), ``source``, ``date``,
    ``sender``, ``raw_message``.
    """
    sb = get_supabase()
    word_rows = [
        {
            "german": e["german"],
            "source": e.get("source", "chat"),
            "date": e.get("date", ""),
            "sender": e.get("sender", ""),
            "raw_message": e.get("raw_message", ""),
        }
        for e in entries
    ]
    word_result = sb.table("words").insert(word_rows).execute()

    translation_rows = []
    for e, word_data in zip(entries, word_result.data):
        lang = e.get("translation_lang", "es")
        if lang not in ("es", "en"):
            lang = "es"
        translation_rows.append({
            "word_id": word_data["id"],
            "language": lang,
            "translation": e["translation"],
        })

    if translation_rows:
        sb.table("translations").insert(translation_rows).execute()

    return json.dumps({
        "stored": len(word_result.data),
        "items": [r["german"] for r in word_result.data],
    })


async def store_texts(entries: list[dict[str, str]]) -> str:
    """Store one or more German texts (sentences, phrases) for grammar review.

    Each entry must have key ``content`` (or ``sentence`` for backward compat).
    Optional: ``source``, ``date``, ``sender``.
    """
    rows = [
        {
            "content": e.get("content") or e.get("sentence", ""),
            "source": e.get("source", "chat"),
            "date": e.get("date", ""),
            "sender": e.get("sender", ""),
        }
        for e in entries
    ]
    result = get_supabase().table("texts").insert(rows).execute()
    return json.dumps({"stored": len(result.data)})


# ---------------------------------------------------------------------------
# File-dependent tools (created per-request via closure)
# ---------------------------------------------------------------------------

def make_file_tools(uploaded_files: dict[str, bytes]):
    """Return tool functions that capture *uploaded_files* for file access."""

    async def extract_from_image(filename: str) -> str:
        """Extract German vocabulary and sentences from a notebook photo.

        Runs OCR to get raw text lines, then classifies and stores them.
        """
        image_bytes = uploaded_files.get(filename, b"")
        if not image_bytes:
            return json.dumps({"error": f"Image file '{filename}' not found in upload"})

        suffix = Path(filename).suffix or ".jpg"
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(image_bytes)
            tmp_path = Path(tmp.name)

        try:
            api_key = os.environ["ANTHROPIC_API_KEY"]
            lines = ocr_extract(tmp_path, api_key=api_key)
        finally:
            tmp_path.unlink(missing_ok=True)

        result = classify_and_store(lines, source="notebook", sender="notebook")
        return json.dumps(result)

    async def parse_whatsapp_export(filename: str) -> str:
        """Parse a WhatsApp .txt chat export to extract German vocabulary and sentences.

        Runs the WhatsApp parser, then classifies and stores results.
        """
        file_bytes = uploaded_files.get(filename, b"")
        if not file_bytes:
            return json.dumps({"error": f"File '{filename}' not found in upload"})

        with tempfile.NamedTemporaryFile(suffix=".txt", mode="wb", delete=False) as tmp:
            tmp.write(file_bytes)
            tmp_path = Path(tmp.name)

        try:
            messages = list(parse_file(tmp_path))
        finally:
            tmp_path.unlink(missing_ok=True)

        result = classify_messages_and_store(messages, source="whatsapp")
        return json.dumps(result)

    return extract_from_image, parse_whatsapp_export
