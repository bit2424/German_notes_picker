"""Tool handler implementations invoked by the main agent."""

from __future__ import annotations

import tempfile
from pathlib import Path
from typing import Any

from german_notes.api.supabase_client import get_supabase
from german_notes.core.models import GermanSentence, Message, VocabPair
from german_notes.extractor.classifier import classify
from german_notes.extractor.parser import parse_file
from german_notes.ocr.client import extract_from_image as ocr_extract


def store_vocabulary(entries: list[dict[str, str]]) -> dict[str, Any]:
    """Insert one or more vocabulary pairs into Supabase.

    Each entry must have keys: german, translation.
    Optional keys: translation_lang, source, date, sender, raw_message.
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
    return {"stored": len(result.data), "items": [r["german"] for r in result.data]}


def store_sentences(entries: list[dict[str, str]]) -> dict[str, Any]:
    """Insert one or more German sentences into Supabase.

    Each entry must have key: sentence.
    Optional keys: source, date, sender.
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
    return {"stored": len(result.data)}


def extract_from_image(image_bytes: bytes, filename: str, api_key: str) -> dict[str, Any]:
    """Run OCR on an image, store results, and return a summary."""
    suffix = Path(filename).suffix or ".jpg"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(image_bytes)
        tmp_path = Path(tmp.name)

    try:
        vocab_pairs, sentences = ocr_extract(tmp_path, api_key=api_key)
    finally:
        tmp_path.unlink(missing_ok=True)

    stored_vocab = 0
    stored_sents = 0

    if vocab_pairs:
        rows = [
            {
                "german": vp.german,
                "translation": vp.translation,
                "translation_lang": vp.translation_lang,
                "source": "notebook",
                "date": vp.date,
                "sender": vp.sender,
                "raw_message": vp.raw_message,
            }
            for vp in vocab_pairs
        ]
        res = get_supabase().table("vocabulary").insert(rows).execute()
        stored_vocab = len(res.data)

    if sentences:
        rows = [
            {
                "sentence": s.sentence,
                "source": "notebook",
                "date": s.date,
                "sender": s.sender,
            }
            for s in sentences
        ]
        res = get_supabase().table("sentences").insert(rows).execute()
        stored_sents = len(res.data)

    return {
        "vocab_extracted": len(vocab_pairs),
        "sentences_extracted": len(sentences),
        "vocab_stored": stored_vocab,
        "sentences_stored": stored_sents,
        "vocab_preview": [vp.german for vp in vocab_pairs[:5]],
    }


def parse_whatsapp_export(file_bytes: bytes, filename: str) -> dict[str, Any]:
    """Parse a WhatsApp .txt export, classify messages, store results."""
    with tempfile.NamedTemporaryFile(suffix=".txt", mode="wb", delete=False) as tmp:
        tmp.write(file_bytes)
        tmp_path = Path(tmp.name)

    vocab_pairs: list[VocabPair] = []
    sentences: list[GermanSentence] = []

    try:
        for msg in parse_file(tmp_path):
            result = classify(msg)
            if isinstance(result, VocabPair):
                vocab_pairs.append(result)
            elif isinstance(result, GermanSentence):
                sentences.append(result)
    finally:
        tmp_path.unlink(missing_ok=True)

    stored_vocab = 0
    stored_sents = 0

    if vocab_pairs:
        rows = [
            {
                "german": vp.german,
                "translation": vp.translation,
                "translation_lang": vp.translation_lang,
                "source": "whatsapp",
                "date": vp.date,
                "sender": vp.sender,
                "raw_message": vp.raw_message,
            }
            for vp in vocab_pairs
        ]
        res = get_supabase().table("vocabulary").insert(rows).execute()
        stored_vocab = len(res.data)

    if sentences:
        rows = [
            {
                "sentence": s.sentence,
                "source": "whatsapp",
                "date": s.date,
                "sender": s.sender,
            }
            for s in sentences
        ]
        res = get_supabase().table("sentences").insert(rows).execute()
        stored_sents = len(res.data)

    return {
        "messages_parsed": len(vocab_pairs) + len(sentences),
        "vocab_stored": stored_vocab,
        "sentences_stored": stored_sents,
        "vocab_preview": [vp.german for vp in vocab_pairs[:5]],
    }


TOOL_REGISTRY: dict[str, callable] = {
    "store_vocabulary": store_vocabulary,
    "store_sentences": store_sentences,
}
