"""Integration tests for word-addition helpers in ``agents/db_helpers.py``.

These exercise the multi-table fan-out (words → translations → verb/noun
details → tags → explanations) against a fake Supabase client.
"""

from __future__ import annotations

import pytest

from german_notes.agents.db_helpers import (
    assign_tags,
    insert_word_complete,
    upsert_noun_details,
    upsert_verb_details,
)
from tests.fakes.supabase import FakeSupabase


def test_inserts_minimal_word(fake_sb: FakeSupabase) -> None:
    record = insert_word_complete({"german": "Haus", "word_type": "noun"})

    assert record["german"] == "Haus"
    assert record["word_type"] == "noun"
    assert record["id"]
    assert len(fake_sb.tables["words"]) == 1


def test_inserts_translations_linked_to_word(fake_sb: FakeSupabase) -> None:
    record = insert_word_complete(
        {
            "german": "Haus",
            "word_type": "noun",
            "translations": [
                {"language": "es", "translation": "casa"},
                {"language": "en", "translation": "house"},
            ],
        }
    )

    translations = fake_sb.tables["translations"]
    assert len(translations) == 2
    assert {t["language"] for t in translations} == {"es", "en"}
    assert all(t["word_id"] == record["id"] for t in translations)


def test_skips_translations_with_missing_fields(fake_sb: FakeSupabase) -> None:
    insert_word_complete(
        {
            "german": "Haus",
            "word_type": "noun",
            "translations": [
                {"language": "es", "translation": "casa"},
                {"language": "en", "translation": ""},  # filtered out
                {"language": "", "translation": "house"},  # filtered out
            ],
        }
    )

    assert len(fake_sb.tables["translations"]) == 1
    assert fake_sb.tables["translations"][0]["language"] == "es"


def test_inserts_verb_with_full_grammar(fake_sb: FakeSupabase) -> None:
    record = insert_word_complete(
        {
            "german": "essen",
            "word_type": "verb",
            "verb_details": {
                "infinitive": "essen",
                "participle": "gegessen",
                "present_ich": "esse",
                "present_du": "isst",
                "present_er": "isst",
                "present_wir": "essen",
                "present_ihr": "esst",
                "present_sie": "essen",
                "case_rule": "akkusativ",
            },
        }
    )

    assert len(fake_sb.tables["verb_details"]) == 1
    detail = fake_sb.tables["verb_details"][0]
    assert detail["word_id"] == record["id"]
    assert detail["infinitive"] == "essen"
    assert detail["participle"] == "gegessen"
    assert detail["present_du"] == "isst"
    assert detail["case_rule"] == "akkusativ"


def test_skips_verb_details_when_word_type_not_verb(fake_sb: FakeSupabase) -> None:
    insert_word_complete(
        {
            "german": "Haus",
            "word_type": "noun",
            "verb_details": {"infinitive": "essen"},  # ignored: word is a noun
        }
    )

    assert fake_sb.tables.get("verb_details", []) == []


def test_inserts_noun_details(fake_sb: FakeSupabase) -> None:
    record = insert_word_complete(
        {
            "german": "Haus",
            "word_type": "noun",
            "noun_details": {"article": "das", "plural": "Häuser"},
        }
    )

    assert len(fake_sb.tables["noun_details"]) == 1
    detail = fake_sb.tables["noun_details"][0]
    assert detail["word_id"] == record["id"]
    assert detail["article"] == "das"
    assert detail["plural"] == "Häuser"


def test_assign_tags_creates_new_tags(fake_sb: FakeSupabase) -> None:
    record = insert_word_complete(
        {"german": "Haus", "word_type": "noun", "tags": ["home", "building"]}
    )

    tag_names = {t["name"] for t in fake_sb.tables["tags"]}
    assert tag_names == {"home", "building"}

    links = fake_sb.tables["word_tags"]
    assert len(links) == 2
    assert all(link["word_id"] == record["id"] for link in links)


def test_assign_tags_reuses_existing_tag(fake_sb: FakeSupabase) -> None:
    fake_sb.seed("tags", [{"name": "home"}])
    existing_tag_id = fake_sb.tables["tags"][0]["id"]

    insert_word_complete({"german": "Haus", "word_type": "noun", "tags": ["home"]})

    assert len(fake_sb.tables["tags"]) == 1, "should not duplicate the tag"
    assert fake_sb.tables["word_tags"][0]["tag_id"] == existing_tag_id


def test_assign_tags_matches_existing_case_insensitively(fake_sb: FakeSupabase) -> None:
    fake_sb.seed("tags", [{"name": "Home"}])
    existing_tag_id = fake_sb.tables["tags"][0]["id"]

    insert_word_complete({"german": "Haus", "word_type": "noun", "tags": ["HOME"]})

    assert len(fake_sb.tables["tags"]) == 1
    assert fake_sb.tables["word_tags"][0]["tag_id"] == existing_tag_id


def test_assign_tags_does_not_duplicate_existing_link(fake_sb: FakeSupabase) -> None:
    fake_sb.seed("words", [{"id": "word-1", "german": "Haus", "word_type": "noun"}])
    fake_sb.seed("tags", [{"id": "tag-1", "name": "home"}])
    fake_sb.seed("word_tags", [{"word_id": "word-1", "tag_id": "tag-1"}])

    new_links = assign_tags(fake_sb, "word-1", ["home", "building"])

    assert new_links == 1, "only 'building' is new"
    assert len(fake_sb.tables["word_tags"]) == 2


def test_inserts_polymorphic_explanation(fake_sb: FakeSupabase) -> None:
    record = insert_word_complete(
        {
            "german": "Haus",
            "word_type": "noun",
            "explanation": "A common everyday noun for a dwelling.",
        }
    )

    assert len(fake_sb.tables["explanations"]) == 1
    explanation = fake_sb.tables["explanations"][0]
    assert explanation["entity_type"] == "word"
    assert explanation["entity_id"] == record["id"]
    assert "dwelling" in explanation["content"]


def test_full_happy_path_writes_to_all_tables(fake_sb: FakeSupabase) -> None:
    record = insert_word_complete(
        {
            "german": "essen",
            "word_type": "verb",
            "source": "chat",
            "translations": [
                {"language": "es", "translation": "comer"},
                {"language": "en", "translation": "to eat"},
            ],
            "verb_details": {
                "infinitive": "essen",
                "participle": "gegessen",
                "present_ich": "esse",
                "present_du": "isst",
                "present_er": "isst",
                "present_wir": "essen",
                "present_ihr": "esst",
                "present_sie": "essen",
                "case_rule": "akkusativ",
            },
            "tags": ["food", "everyday"],
            "explanation": "Used for eating any solid food.",
        }
    )

    assert len(fake_sb.tables["words"]) == 1
    assert len(fake_sb.tables["translations"]) == 2
    assert len(fake_sb.tables["verb_details"]) == 1
    assert len(fake_sb.tables["tags"]) == 2
    assert len(fake_sb.tables["word_tags"]) == 2
    assert len(fake_sb.tables["explanations"]) == 1

    word_id = record["id"]
    assert all(t["word_id"] == word_id for t in fake_sb.tables["translations"])
    assert fake_sb.tables["verb_details"][0]["word_id"] == word_id
    assert all(link["word_id"] == word_id for link in fake_sb.tables["word_tags"])
    assert fake_sb.tables["explanations"][0]["entity_id"] == word_id


def test_upsert_verb_details_updates_existing_row(fake_sb: FakeSupabase) -> None:
    record = insert_word_complete(
        {
            "german": "essen",
            "word_type": "verb",
            "verb_details": {"infinitive": "essen", "present_ich": "esse"},
        }
    )

    upsert_verb_details(
        fake_sb,
        record["id"],
        {"present_ich": "esse", "present_du": "isst", "participle": "gegessen"},
    )

    assert len(fake_sb.tables["verb_details"]) == 1, "must update, not insert a duplicate"
    detail = fake_sb.tables["verb_details"][0]
    assert detail["present_du"] == "isst"
    assert detail["participle"] == "gegessen"


def test_upsert_noun_details_updates_existing_row(fake_sb: FakeSupabase) -> None:
    record = insert_word_complete(
        {
            "german": "Haus",
            "word_type": "noun",
            "noun_details": {"article": "das"},
        }
    )

    upsert_noun_details(fake_sb, record["id"], {"article": "das", "plural": "Häuser"})

    assert len(fake_sb.tables["noun_details"]) == 1
    assert fake_sb.tables["noun_details"][0]["plural"] == "Häuser"


@pytest.mark.parametrize(
    "missing_payload",
    [
        {},
        {"infinitive": "", "participle": ""},  # all values falsy → filtered to empty
    ],
)
def test_upsert_verb_details_noop_when_no_fields(
    fake_sb: FakeSupabase, missing_payload: dict[str, str]
) -> None:
    fake_sb.seed("words", [{"id": "word-1", "german": "essen", "word_type": "verb"}])

    upsert_verb_details(fake_sb, "word-1", missing_payload)

    assert fake_sb.tables.get("verb_details", []) == []
