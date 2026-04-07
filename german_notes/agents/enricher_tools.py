"""Enricher agent tools: schema discovery, word fetching, and proposal collection.

All tools are created per-request via ``make_enricher_tools()`` so that
the proposals list is isolated to a single enrichment run.
"""

from __future__ import annotations

import json
from typing import Any, Callable

from german_notes.api.supabase_client import get_supabase

WORD_TABLES = (
    "words", "translations", "verb_details", "noun_details",
    "adjective_declensions", "word_tags", "tags", "explanations",
)

_SCHEMA: dict[str, Any] = {
    "words": {
        "columns": {
            "id": "uuid PK",
            "german": "text NOT NULL",
            "word_type": "text (noun | verb | adjective | other)",
            "source": "text (whatsapp | notebook | chat | manual)",
            "date": "text",
            "sender": "text",
            "raw_message": "text",
            "created_at": "timestamptz",
            "updated_at": "timestamptz",
            "deleted_at": "timestamptz (soft-delete)",
        },
        "relationships": [
            "translations (1:N via translations.word_id)",
            "verb_details (1:1 via verb_details.word_id, only when word_type='verb')",
            "noun_details (1:1 via noun_details.word_id, only when word_type='noun')",
            "adjective_declensions (1:N via adjective_declensions.word_id, only when word_type='adjective')",
            "word_tags (M:N via word_tags junction -> tags)",
            "explanations (1:N polymorphic via explanations where entity_type='word')",
        ],
    },
    "translations": {
        "columns": {
            "id": "uuid PK",
            "word_id": "uuid FK -> words",
            "language": "text ('es' for Spanish | 'en' for English)",
            "translation": "text NOT NULL",
        },
        "notes": "Each word should ideally have at least one 'es' and one 'en' translation.",
    },
    "verb_details": {
        "columns": {
            "id": "uuid PK",
            "word_id": "uuid FK -> words (UNIQUE, 1:1)",
            "infinitive": "text",
            "participle": "text (past participle, e.g. 'gemacht')",
            "present_ich": "text (ich-form, e.g. 'mache')",
            "present_du": "text (du-form, e.g. 'machst')",
            "present_er": "text (er/sie/es-form, e.g. 'macht')",
            "present_wir": "text (wir-form, e.g. 'machen')",
            "present_ihr": "text (ihr-form, e.g. 'macht')",
            "present_sie": "text (sie/Sie-form, e.g. 'machen')",
        },
        "notes": "Only for words where word_type='verb'. Fill all conjugation fields.",
    },
    "noun_details": {
        "columns": {
            "id": "uuid PK",
            "word_id": "uuid FK -> words (UNIQUE, 1:1)",
            "article": "text ('der' | 'die' | 'das')",
            "plural": "text (plural form of the noun)",
        },
        "notes": "Only for words where word_type='noun'. Article is required for German nouns.",
    },
    "adjective_declensions": {
        "columns": {
            "id": "uuid PK",
            "word_id": "uuid FK -> words",
            "case_type": "text ('nominativ' | 'akkusativ' | 'dativ' | 'genitiv')",
            "gender": "text ('maskulin' | 'feminin' | 'neutrum' | 'plural')",
            "form": "text (the declined form)",
        },
        "notes": "Only for words where word_type='adjective'. Unique on (word_id, case_type, gender).",
    },
    "tags": {
        "columns": {
            "id": "uuid PK",
            "name": "text UNIQUE NOT NULL",
        },
        "notes": "Topic labels like 'food', 'travel', 'Konjunktiv II', 'Dativ', etc.",
    },
    "word_tags": {
        "columns": {
            "word_id": "uuid FK -> words (composite PK)",
            "tag_id": "uuid FK -> tags (composite PK)",
        },
    },
    "explanations": {
        "columns": {
            "id": "uuid PK",
            "entity_type": "text ('word' | 'text' | 'translation' | 'text_word')",
            "entity_id": "uuid (polymorphic FK)",
            "content": "text NOT NULL",
        },
        "notes": "For word explanations, use entity_type='word' and entity_id=word.id. "
                 "Content should be a brief usage note or context hint in English.",
    },
}


def make_enricher_tools() -> tuple[
    list[dict[str, Any]],
    Callable,
    Callable,
    Callable,
]:
    """Return ``(proposals_list, get_word_schema, fetch_words_to_enrich, propose_word_enrichment)``.

    The *proposals_list* accumulates proposals in-memory (no DB writes)
    and is read by the caller after the agent finishes.
    """
    proposals: list[dict[str, Any]] = []

    async def get_word_schema() -> str:
        """Return the full database schema for word-related tables.

        Call this first so you understand every table, column, type, and
        relationship before analysing words.
        """
        return json.dumps(_SCHEMA, indent=2)

    async def fetch_words_to_enrich(
        limit: int = 10,
        filter_type: str = "all",
    ) -> str:
        """Fetch words that have incomplete data, together with all related records.

        ``filter_type`` values:
        - ``"all"`` — any word with missing data
        - ``"missing_type"`` — word_type is null
        - ``"missing_translations"`` — fewer than 2 translations
        - ``"missing_details"`` — verbs without verb_details, nouns without noun_details
        - ``"missing_tags"`` — no tags assigned
        """
        sb = get_supabase()

        query = (
            sb.table("words")
            .select(
                "id, german, word_type, source, date, sender, "
                "translations(id, language, translation), "
                "verb_details(id, infinitive, participle, "
                "  present_ich, present_du, present_er, "
                "  present_wir, present_ihr, present_sie), "
                "noun_details(id, article, plural), "
                "adjective_declensions(id, case_type, gender, form), "
                "word_tags(tag_id, tags(id, name))"
            )
            .is_("deleted_at", "null")
            .order("created_at", desc=True)
        )

        rows = query.limit(limit * 3).execute().data

        explanations_by_word: dict[str, list[dict]] = {}
        if rows:
            word_ids = [r["id"] for r in rows]
            expl_rows = (
                sb.table("explanations")
                .select("id, entity_id, content")
                .eq("entity_type", "word")
                .in_("entity_id", word_ids)
                .is_("deleted_at", "null")
                .execute()
                .data
            )
            for e in expl_rows:
                explanations_by_word.setdefault(e["entity_id"], []).append(
                    {"id": e["id"], "content": e["content"]}
                )

        results: list[dict[str, Any]] = []
        for r in rows:
            tags = [
                wt["tags"]
                for wt in (r.get("word_tags") or [])
                if wt.get("tags")
            ]
            word = {
                "id": r["id"],
                "german": r["german"],
                "word_type": r.get("word_type"),
                "source": r.get("source"),
                "translations": r.get("translations") or [],
                "verb_details": (r.get("verb_details") or [None])[0] if isinstance(r.get("verb_details"), list) else r.get("verb_details"),
                "noun_details": (r.get("noun_details") or [None])[0] if isinstance(r.get("noun_details"), list) else r.get("noun_details"),
                "adjective_declensions": r.get("adjective_declensions") or [],
                "tags": tags,
                "explanations": explanations_by_word.get(r["id"], []),
            }

            if _matches_filter(word, filter_type):
                results.append(word)
                if len(results) >= limit:
                    break

        return json.dumps(results, indent=2)

    async def propose_word_enrichment(
        word_id: str,
        german: str,
        word_type: str | None = None,
        translations: list[dict[str, str]] | None = None,
        verb_details: dict[str, str] | None = None,
        noun_details: dict[str, str] | None = None,
        tags: list[str] | None = None,
        explanation: str | None = None,
    ) -> str:
        """Record a proposed enrichment for a word. Nothing is written to the DB.

        Only include fields that are **new** (not already present on the word).
        """
        proposal: dict[str, Any] = {"word_id": word_id, "german": german}
        if word_type is not None:
            proposal["word_type"] = word_type
        if translations:
            proposal["translations"] = translations
        if verb_details:
            proposal["verb_details"] = verb_details
        if noun_details:
            proposal["noun_details"] = noun_details
        if tags:
            proposal["tags"] = tags
        if explanation:
            proposal["explanation"] = explanation

        proposals.append(proposal)
        return f"Proposal recorded for '{german}'"

    return proposals, get_word_schema, fetch_words_to_enrich, propose_word_enrichment


def _matches_filter(word: dict[str, Any], filter_type: str) -> bool:
    """Check whether a word has gaps that match the requested filter."""
    if filter_type == "missing_type":
        return not word.get("word_type")
    if filter_type == "missing_translations":
        langs = {t["language"] for t in word.get("translations", [])}
        return len(langs) < 2
    if filter_type == "missing_details":
        wt = word.get("word_type")
        if wt == "verb" and not word.get("verb_details"):
            return True
        if wt == "noun" and not word.get("noun_details"):
            return True
        return False
    if filter_type == "missing_tags":
        return len(word.get("tags", [])) == 0

    # "all": any gap
    if not word.get("word_type"):
        return True
    langs = {t["language"] for t in word.get("translations", [])}
    if len(langs) < 2:
        return True
    wt = word.get("word_type")
    if wt == "verb" and not word.get("verb_details"):
        return True
    if wt == "noun" and not word.get("noun_details"):
        return True
    if len(word.get("tags", [])) == 0:
        return True
    if len(word.get("explanations", [])) == 0:
        return True
    return False
