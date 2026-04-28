"""Tests for the in-memory propose tools used by the intake agent.

These do not touch the database -- they only verify that proposals are
collected correctly and that each ``make_intake_tools()`` invocation gets
its own isolated list.
"""

from __future__ import annotations

import json

import pytest

from german_notes.agents.intake_tools import make_intake_tools


@pytest.mark.asyncio
async def test_propose_complete_word_collects_full_payload() -> None:
    proposals, propose_word, _ = make_intake_tools()

    result = await propose_word(
        german="essen",
        word_type="verb",
        translations=[
            {"language": "es", "translation": "comer"},
            {"language": "en", "translation": "to eat"},
        ],
        verb_details={"infinitive": "essen"},
        tags=["food"],
        explanation="Used for eating solid food.",
        source="chat",
    )

    assert json.loads(result) == {"german": "essen", "word_type": "verb", "proposed": True}
    assert len(proposals) == 1
    proposal = proposals[0]
    assert proposal["german"] == "essen"
    assert proposal["word_type"] == "verb"
    assert proposal["source"] == "chat"
    assert proposal["verb_details"] == {"infinitive": "essen"}
    assert proposal["tags"] == ["food"]
    assert proposal["explanation"] == "Used for eating solid food."


@pytest.mark.asyncio
async def test_propose_complete_word_omits_optional_fields_when_unset() -> None:
    proposals, propose_word, _ = make_intake_tools()

    await propose_word(
        german="Haus",
        word_type="noun",
        translations=[{"language": "es", "translation": "casa"}],
    )

    proposal = proposals[0]
    assert "verb_details" not in proposal
    assert "noun_details" not in proposal
    assert "tags" not in proposal
    assert "explanation" not in proposal


@pytest.mark.asyncio
async def test_propose_complete_text_collects_proposal() -> None:
    proposals, _, propose_text = make_intake_tools()

    await propose_text(
        content="Ich gehe nach Hause.",
        translations=[{"language": "en", "translation": "I am going home."}],
    )

    assert len(proposals) == 1
    proposal = proposals[0]
    assert proposal["type"] == "text"
    assert proposal["content"] == "Ich gehe nach Hause."
    assert proposal["translations"][0]["language"] == "en"


@pytest.mark.asyncio
async def test_each_factory_call_gets_independent_proposals_list() -> None:
    proposals_a, propose_word_a, _ = make_intake_tools()
    proposals_b, propose_word_b, _ = make_intake_tools()

    await propose_word_a(german="A", word_type="other", translations=[])
    await propose_word_b(german="B", word_type="other", translations=[])
    await propose_word_b(german="C", word_type="other", translations=[])

    assert [p["german"] for p in proposals_a] == ["A"]
    assert [p["german"] for p in proposals_b] == ["B", "C"]
