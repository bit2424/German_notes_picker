"""Quiz agent tools: word fetching and quiz question collection.

All tools are created per-request via ``make_quiz_tools()`` so that
the questions list is isolated to a single quiz generation run.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Callable

from german_notes.api.supabase_client import get_supabase

logger = logging.getLogger(__name__)


def make_quiz_tools(
    tag_ids: list[str] | None = None,
    prompt: str | None = None,
    count: int = 10,
    types: list[str] | None = None,
) -> tuple[list[dict[str, Any]], Callable, Callable, Callable]:
    """Return ``(questions_list, fetch_words_for_quiz, fetch_all_translations, build_quiz)``.

    The *questions_list* accumulates generated questions in-memory
    and is read by the caller after the agent finishes.
    """
    questions: list[dict[str, Any]] = []
    _tag_ids = tag_ids
    _prompt = prompt
    _count = count
    _types = types or ["flashcard", "multiple_choice"]

    async def fetch_words_for_quiz(limit: int = 50) -> str:
        """Fetch words with translations for quiz generation.

        If tag IDs were provided, only words matching those tags are returned.
        Returns word+translation pairs as JSON for the LLM to build questions from.
        """
        sb = get_supabase()

        if _tag_ids:
            tag_links = (
                sb.table("word_tags")
                .select("word_id")
                .in_("tag_id", _tag_ids)
                .execute()
                .data
            )
            word_ids = list({row["word_id"] for row in tag_links})
            if not word_ids:
                return json.dumps({"words": [], "note": "No words found for the given tags."})

            rows = (
                sb.table("words")
                .select(
                    "id, german, word_type, "
                    "translations(id, language, translation), "
                    "word_tags(tag_id, tags(id, name))"
                )
                .in_("id", word_ids)
                .is_("deleted_at", "null")
                .limit(limit)
                .execute()
                .data
            )
        else:
            rows = (
                sb.table("words")
                .select(
                    "id, german, word_type, "
                    "translations(id, language, translation), "
                    "word_tags(tag_id, tags(id, name))"
                )
                .is_("deleted_at", "null")
                .order("created_at", desc=True)
                .limit(limit)
                .execute()
                .data
            )

        words = []
        for r in rows:
            tags = [
                wt["tags"]["name"]
                for wt in (r.get("word_tags") or [])
                if wt.get("tags")
            ]
            translations = r.get("translations") or []
            if not translations:
                continue
            words.append({
                "id": r["id"],
                "german": r["german"],
                "word_type": r.get("word_type"),
                "translations": [
                    {"language": t["language"], "translation": t["translation"]}
                    for t in translations
                ],
                "tags": tags,
            })

        return json.dumps({
            "words": words,
            "total": len(words),
            "prompt": _prompt,
            "requested_count": _count,
            "requested_types": _types,
        }, indent=2)

    async def fetch_all_translations(limit: int = 100) -> str:
        """Fetch a broad set of translations to use as distractors for multiple-choice questions.

        Returns translations from words NOT necessarily in the quiz pool,
        so they can serve as plausible but wrong answer choices.
        """
        sb = get_supabase()
        rows = (
            sb.table("translations")
            .select("translation, language")
            .is_("deleted_at", "null")
            .limit(limit)
            .execute()
            .data
        )
        return json.dumps(rows)

    async def build_quiz(quiz_questions: list[dict[str, Any]]) -> str:
        """Record the generated quiz questions. Call this once with all questions.

        Each question must have:
        - ``id``: a unique string like "q1", "q2", etc.
        - ``type``: "flashcard" or "multiple_choice"
        - ``prompt``: the question text shown to the user
        - ``german``: the German word/phrase being tested
        - ``answer``: the correct answer
        - ``options``: list of 4 strings (only for multiple_choice, include the correct answer)
        - ``word_id``: the UUID of the source word
        - ``hint``: an optional hint string (can be empty)
        """
        for q in quiz_questions:
            questions.append({
                "id": q.get("id", f"q{len(questions)+1}"),
                "type": q.get("type", "flashcard"),
                "prompt": q.get("prompt", ""),
                "german": q.get("german", ""),
                "answer": q.get("answer", ""),
                "options": q.get("options", []),
                "word_id": q.get("word_id", ""),
                "hint": q.get("hint", ""),
            })
        logger.info("Quiz built with %d questions", len(questions))
        return f"Quiz recorded with {len(questions)} questions."

    return questions, fetch_words_for_quiz, fetch_all_translations, build_quiz
