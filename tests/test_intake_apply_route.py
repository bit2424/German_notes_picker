"""Integration tests for ``POST /api/intake/apply``.

Exercises the HTTP boundary plus the full multi-table write through the
fake Supabase client.
"""

from __future__ import annotations

from typing import Any
from unittest.mock import patch

from fastapi.testclient import TestClient

from tests.fakes.supabase import FakeSupabase


def _verb_proposal() -> dict[str, Any]:
    return {
        "german": "essen",
        "word_type": "verb",
        "translations": [
            {"language": "es", "translation": "comer"},
            {"language": "en", "translation": "to eat"},
        ],
        "verb_details": {
            "infinitive": "essen",
            "participle": "gegessen",
            "present_ich": "esse",
        },
        "tags": ["food"],
        "explanation": "Eating solid food.",
    }


def _noun_proposal() -> dict[str, Any]:
    return {
        "german": "Haus",
        "word_type": "noun",
        "translations": [
            {"language": "es", "translation": "casa"},
            {"language": "en", "translation": "house"},
        ],
        "noun_details": {"article": "das", "plural": "Häuser"},
    }


def test_applies_single_proposal(client: TestClient, fake_sb: FakeSupabase) -> None:
    response = client.post("/api/intake/apply", json={"approved": [_verb_proposal()]})

    assert response.status_code == 200
    body = response.json()
    assert body["applied"] == 1
    assert body["total"] == 1
    assert body["details"][0]["ok"] is True
    assert body["details"][0]["german"] == "essen"
    assert body["details"][0]["word_type"] == "verb"
    assert body["details"][0]["word_id"]

    assert len(fake_sb.tables["words"]) == 1


def test_applies_multiple_proposals(client: TestClient, fake_sb: FakeSupabase) -> None:
    response = client.post(
        "/api/intake/apply",
        json={"approved": [_verb_proposal(), _noun_proposal()]},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["applied"] == 2
    assert body["total"] == 2
    assert all(d["ok"] for d in body["details"])

    assert len(fake_sb.tables["words"]) == 2
    assert {w["word_type"] for w in fake_sb.tables["words"]} == {"verb", "noun"}


def test_writes_across_all_tables(client: TestClient, fake_sb: FakeSupabase) -> None:
    response = client.post("/api/intake/apply", json={"approved": [_verb_proposal()]})

    assert response.status_code == 200
    word_id = response.json()["details"][0]["word_id"]

    assert len(fake_sb.tables["translations"]) == 2
    assert all(t["word_id"] == word_id for t in fake_sb.tables["translations"])
    assert len(fake_sb.tables["verb_details"]) == 1
    assert fake_sb.tables["verb_details"][0]["word_id"] == word_id
    assert {t["name"] for t in fake_sb.tables["tags"]} == {"food"}
    assert len(fake_sb.tables["word_tags"]) == 1
    assert len(fake_sb.tables["explanations"]) == 1
    assert fake_sb.tables["explanations"][0]["entity_id"] == word_id


def test_missing_approved_returns_400(client: TestClient, fake_sb: FakeSupabase) -> None:
    response = client.post("/api/intake/apply", json={})

    assert response.status_code == 400
    assert "approved" in response.json()["detail"]


def test_empty_approved_returns_400(client: TestClient, fake_sb: FakeSupabase) -> None:
    response = client.post("/api/intake/apply", json={"approved": []})

    assert response.status_code == 400


def test_partial_failure_reports_per_proposal(client: TestClient, fake_sb: FakeSupabase) -> None:
    proposals = [_noun_proposal(), _verb_proposal()]

    real_insert_table = fake_sb.tables  # capture for closure

    original_table_method = type(fake_sb).table
    call_count = {"verb_details": 0}

    def flaky_table(self, name: str):  # type: ignore[no-untyped-def]
        if name == "verb_details":
            call_count["verb_details"] += 1
            raise RuntimeError("simulated DB failure on verb_details")
        return original_table_method(self, name)

    with patch.object(type(fake_sb), "table", flaky_table):
        response = client.post("/api/intake/apply", json={"approved": proposals})

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 2
    assert body["applied"] == 1
    assert call_count["verb_details"] >= 1

    statuses = {d["german"]: d["ok"] for d in body["details"]}
    assert statuses == {"Haus": True, "essen": False}

    # Sanity: the noun still landed.
    assert any(w["german"] == "Haus" for w in real_insert_table["words"])
