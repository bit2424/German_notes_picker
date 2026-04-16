"""Shared database helpers for writing word-related data to Supabase.

Used by both the enricher (retroactive completions) and the intake agent
(storing fully-populated words at creation time).
"""

from __future__ import annotations

from typing import Any

from german_notes.api.supabase_client import get_supabase


def upsert_verb_details(sb, word_id: str, fields: dict[str, str]) -> None:
    allowed = (
        "infinitive", "participle",
        "present_ich", "present_du", "present_er",
        "present_wir", "present_ihr", "present_sie",
        "case_rule", "is_reflexive",
    )
    row = {k: v for k, v in fields.items() if k in allowed and v}
    if not row:
        return

    existing = (
        sb.table("verb_details")
        .select("id")
        .eq("word_id", word_id)
        .is_("deleted_at", "null")
        .execute()
    )
    if existing.data:
        sb.table("verb_details").update(row).eq("id", existing.data[0]["id"]).execute()
    else:
        row["word_id"] = word_id
        sb.table("verb_details").insert(row).execute()


def upsert_noun_details(sb, word_id: str, fields: dict[str, str]) -> None:
    row = {k: v for k, v in fields.items() if k in ("article", "plural") and v}
    if not row:
        return

    existing = (
        sb.table("noun_details")
        .select("id")
        .eq("word_id", word_id)
        .is_("deleted_at", "null")
        .execute()
    )
    if existing.data:
        sb.table("noun_details").update(row).eq("id", existing.data[0]["id"]).execute()
    else:
        row["word_id"] = word_id
        sb.table("noun_details").insert(row).execute()


def assign_tags(sb, word_id: str, tag_names: list[str]) -> int:
    """Find-or-create tags by name and link them to the word. Returns count of new links."""
    existing_tags = (
        sb.table("tags")
        .select("id, name")
        .is_("deleted_at", "null")
        .execute()
        .data
    )
    name_to_id = {t["name"].lower(): t["id"] for t in existing_tags}

    existing_links = (
        sb.table("word_tags")
        .select("tag_id")
        .eq("word_id", word_id)
        .execute()
        .data
    )
    linked_tag_ids = {link["tag_id"] for link in existing_links}

    count = 0
    for name in tag_names:
        tag_id = name_to_id.get(name.lower())
        if not tag_id:
            result = sb.table("tags").insert({"name": name}).execute()
            tag_id = result.data[0]["id"]
            name_to_id[name.lower()] = tag_id

        if tag_id not in linked_tag_ids:
            sb.table("word_tags").insert({
                "word_id": word_id,
                "tag_id": tag_id,
            }).execute()
            linked_tag_ids.add(tag_id)
            count += 1

    return count


def insert_text_complete(text_data: dict[str, Any]) -> dict[str, Any]:
    """Insert a text record with optional translations.

    Accepts a dict with keys: content, source, translations (optional).
    Returns the created text row (with id).
    """
    sb = get_supabase()

    text_row = {
        "content": text_data["content"],
        "source": text_data.get("source", "chat"),
    }
    text_result = sb.table("texts").insert(text_row).execute()
    text_record = text_result.data[0]
    text_id = text_record["id"]

    translations = text_data.get("translations", [])
    if translations:
        translation_rows = [
            {
                "text_id": text_id,
                "language": t["language"],
                "translation": t["translation"],
            }
            for t in translations
            if t.get("language") and t.get("translation")
        ]
        if translation_rows:
            sb.table("translations").insert(translation_rows).execute()

    return text_record


def insert_word_complete(word_data: dict[str, Any]) -> dict[str, Any]:
    """Insert a fully-populated word record with all related data.

    Accepts a dict with keys: german, word_type, source, translations,
    verb_details, noun_details, tags, explanation.

    Returns the created word row (with id).
    """
    sb = get_supabase()

    word_row = {
        "german": word_data["german"],
        "word_type": word_data.get("word_type", "other"),
        "source": word_data.get("source", "chat"),
        "date": word_data.get("date", ""),
        "sender": word_data.get("sender", ""),
        "raw_message": word_data.get("raw_message", ""),
    }
    word_result = sb.table("words").insert(word_row).execute()
    word_record = word_result.data[0]
    word_id = word_record["id"]

    translations = word_data.get("translations", [])
    if translations:
        translation_rows = [
            {
                "word_id": word_id,
                "language": t["language"],
                "translation": t["translation"],
            }
            for t in translations
            if t.get("language") and t.get("translation")
        ]
        if translation_rows:
            sb.table("translations").insert(translation_rows).execute()

    if word_data.get("verb_details") and word_data.get("word_type") == "verb":
        upsert_verb_details(sb, word_id, word_data["verb_details"])

    if word_data.get("noun_details") and word_data.get("word_type") == "noun":
        upsert_noun_details(sb, word_id, word_data["noun_details"])

    if word_data.get("tags"):
        assign_tags(sb, word_id, word_data["tags"])

    if word_data.get("explanation"):
        sb.table("explanations").insert({
            "entity_type": "word",
            "entity_id": word_id,
            "content": word_data["explanation"],
        }).execute()

    return word_record
