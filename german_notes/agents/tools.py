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

def _store_vocab_rows(
    vocab_pairs: list[VocabPair], source: str,
) -> int:
    """Insert classified VocabPair objects into Supabase and return count."""
    if not vocab_pairs:
        return 0
    rows = [
        {
            "german": vp.german,
            "translation": vp.translation,
            "translation_lang": vp.translation_lang,
            "source": source,
            "date": vp.date,
            "sender": vp.sender,
            "raw_message": vp.raw_message,
        }
        for vp in vocab_pairs
    ]
    res = get_supabase().table("vocabulary").insert(rows).execute()
    return len(res.data)


def _store_sentence_rows(
    sentences: list[GermanSentence], source: str,
) -> int:
    """Insert classified GermanSentence objects into Supabase and return count."""
    if not sentences:
        return 0
    rows = [
        {
            "sentence": s.sentence,
            "source": source,
            "date": s.date,
            "sender": s.sender,
        }
        for s in sentences
    ]
    res = get_supabase().table("sentences").insert(rows).execute()
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

    stored_vocab = _store_vocab_rows(vocab_pairs, source)
    stored_sents = _store_sentence_rows(sentences, source)

    return {
        "lines_received": len(lines),
        "vocab_classified": len(vocab_pairs),
        "sentences_classified": len(sentences),
        "vocab_stored": stored_vocab,
        "sentences_stored": stored_sents,
        "vocab_preview": [vp.german for vp in vocab_pairs[:5]],
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

    stored_vocab = _store_vocab_rows(vocab_pairs, source)
    stored_sents = _store_sentence_rows(sentences, source)

    return {
        "messages_parsed": len(messages),
        "vocab_classified": len(vocab_pairs),
        "sentences_classified": len(sentences),
        "vocab_stored": stored_vocab,
        "sentences_stored": stored_sents,
        "vocab_preview": [vp.german for vp in vocab_pairs[:5]],
    }


# ---------------------------------------------------------------------------
# AutoGen tool functions (called by the AssistantAgent)
# ---------------------------------------------------------------------------

async def store_vocabulary(entries: list[dict[str, str]]) -> str:
    """Store one or more German vocabulary pairs (word + translation).

    Each entry must have keys ``german`` and ``translation``.
    Optional: ``translation_lang``, ``source``, ``date``, ``sender``, ``raw_message``.
    """
    rows = []
    for e in entries:
        rows.append(
            {
                "german": e["german"],
                "translation": e["translation"],
                "translation_lang": e.get("translation_lang", "unknown"),
                "source": e.get("source", "chat"),
                "date": e.get("date", ""),
                "sender": e.get("sender", ""),
                "raw_message": e.get("raw_message", ""),
            }
        )
    result = get_supabase().table("vocabulary").insert(rows).execute()
    return json.dumps({"stored": len(result.data), "items": [r["german"] for r in result.data]})


async def store_sentences(entries: list[dict[str, str]]) -> str:
    """Store one or more German sentences for grammar review.

    Each entry must have key ``sentence``.  Optional: ``source``, ``date``, ``sender``.
    """
    rows = []
    for e in entries:
        rows.append(
            {
                "sentence": e["sentence"],
                "source": e.get("source", "chat"),
                "date": e.get("date", ""),
                "sender": e.get("sender", ""),
            }
        )
    result = get_supabase().table("sentences").insert(rows).execute()
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
