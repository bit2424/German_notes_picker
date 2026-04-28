"""Unit tests for the chat-history → AutoGen state conversion.

`_build_state_from_history` enforces Anthropic's strict alternation
requirement by merging consecutive same-role messages and trimming any
trailing user messages that have no assistant reply.
"""

from __future__ import annotations

from types import SimpleNamespace

from german_notes.agents.orchestrator import _build_state_from_history, _extract_final_text


def _row(role: str, content: str) -> dict:
    return {"role": role, "content": content}


# ── _build_state_from_history ──────────────────────────────────


def test_alternating_user_and_assistant_messages_preserved() -> None:
    history = [
        _row("user", "Hi"),
        _row("assistant", "Hello!"),
        _row("user", "Tell me about verbs"),
        _row("assistant", "Sure, what kind?"),
    ]
    state = _build_state_from_history(history, agent_name="agent")

    messages = state["llm_context"]["messages"]
    assert [m["type"] for m in messages] == [
        "UserMessage",
        "AssistantMessage",
        "UserMessage",
        "AssistantMessage",
    ]
    assert [m["content"] for m in messages] == [
        "Hi",
        "Hello!",
        "Tell me about verbs",
        "Sure, what kind?",
    ]


def test_consecutive_user_messages_are_merged() -> None:
    history = [
        _row("user", "first"),
        _row("user", "second"),
        _row("assistant", "got it"),
    ]
    state = _build_state_from_history(history, agent_name="agent")
    messages = state["llm_context"]["messages"]

    assert len(messages) == 2
    assert messages[0]["type"] == "UserMessage"
    assert messages[0]["content"] == "first\n\nsecond"
    assert messages[1]["type"] == "AssistantMessage"


def test_consecutive_assistant_messages_are_merged() -> None:
    history = [
        _row("user", "hi"),
        _row("assistant", "hello"),
        _row("assistant", "how can I help?"),
    ]
    # That trailing assistant pair would leave the conversation ending on
    # an assistant turn — that's fine for state loading.
    state = _build_state_from_history(history, agent_name="agent")
    messages = state["llm_context"]["messages"]

    assert len(messages) == 2
    assert messages[1]["content"] == "hello\n\nhow can I help?"


def test_empty_content_messages_are_dropped() -> None:
    history = [
        _row("user", "hi"),
        _row("assistant", ""),
        _row("user", "still there?"),
        _row("assistant", "yes"),
    ]
    state = _build_state_from_history(history, agent_name="agent")
    messages = state["llm_context"]["messages"]

    # The empty assistant row vanishes, then the two user rows merge.
    assert [m["type"] for m in messages] == ["UserMessage", "AssistantMessage"]
    assert messages[0]["content"] == "hi\n\nstill there?"
    assert messages[1]["content"] == "yes"


def test_whitespace_only_content_is_dropped() -> None:
    history = [
        _row("user", "hi"),
        _row("assistant", "   \n  "),
        _row("user", "again"),
        _row("assistant", "ok"),
    ]
    messages = _build_state_from_history(history, "agent")["llm_context"]["messages"]

    assert [m["content"] for m in messages] == ["hi\n\nagain", "ok"]


def test_trailing_user_messages_are_trimmed() -> None:
    # The new user turn is sent separately, so any trailing unanswered user
    # rows in the prior history must be removed.
    history = [
        _row("user", "hi"),
        _row("assistant", "hello"),
        _row("user", "are you there?"),
    ]
    messages = _build_state_from_history(history, "agent")["llm_context"]["messages"]

    assert [m["type"] for m in messages] == ["UserMessage", "AssistantMessage"]


def test_history_of_only_user_messages_yields_empty_state() -> None:
    history = [_row("user", "a"), _row("user", "b")]
    messages = _build_state_from_history(history, "agent")["llm_context"]["messages"]
    assert messages == []


def test_unknown_role_is_ignored() -> None:
    history = [
        _row("user", "hi"),
        _row("system", "ignored"),
        _row("assistant", "ok"),
    ]
    messages = _build_state_from_history(history, "agent")["llm_context"]["messages"]

    assert [m["type"] for m in messages] == ["UserMessage", "AssistantMessage"]
    assert messages[0]["content"] == "hi"


def test_assistant_messages_use_provided_agent_name_as_source() -> None:
    history = [_row("user", "hi"), _row("assistant", "yo")]
    messages = _build_state_from_history(history, agent_name="my_agent")["llm_context"]["messages"]

    assert messages[0]["source"] == "user"
    assert messages[1]["source"] == "my_agent"


def test_state_envelope_shape() -> None:
    state = _build_state_from_history([_row("user", "hi"), _row("assistant", "ok")], "agent")

    assert state["type"] == "AssistantAgentState"
    assert state["version"] == "1.0.0"
    assert "messages" in state["llm_context"]


def test_empty_history_yields_empty_messages() -> None:
    state = _build_state_from_history([], "agent")
    assert state["llm_context"]["messages"] == []


def test_missing_content_key_is_treated_as_empty() -> None:
    # Defensive: ``msg.get("content") or ""`` handles a row without ``content``.
    history = [{"role": "user"}, _row("assistant", "ok")]
    messages = _build_state_from_history(history, "agent")["llm_context"]["messages"]

    # The empty user row is dropped; trailing-user trim doesn't apply here.
    assert [m["type"] for m in messages] == ["AssistantMessage"]


# ── _extract_final_text ────────────────────────────────────────


def test_extract_final_text_returns_string_content() -> None:
    response = SimpleNamespace(chat_message=SimpleNamespace(content="hello there"))
    assert _extract_final_text(response) == "hello there"


def test_extract_final_text_handles_none_chat_message() -> None:
    response = SimpleNamespace(chat_message=None)
    text = _extract_final_text(response)
    assert "issue" in text.lower()


def test_extract_final_text_stringifies_non_string_content() -> None:
    response = SimpleNamespace(chat_message=SimpleNamespace(content=["a", "b"]))
    assert _extract_final_text(response) == "['a', 'b']"
