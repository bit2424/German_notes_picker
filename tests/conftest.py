"""Shared pytest fixtures.

Patches every module-level binding of ``get_supabase`` to return a fresh
``FakeSupabase`` per test, so the real Supabase client is never instantiated
and no ``SUPABASE_URL`` / ``SUPABASE_KEY`` env vars are required.
"""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from tests.fakes.supabase import FakeSupabase

# Every module that does ``from german_notes.api.supabase_client import get_supabase``
# binds the function name into its own namespace, so each binding must be patched.
_BINDING_SITES = (
    "german_notes.api.supabase_client",
    "german_notes.api.routes",
    "german_notes.api.tools",
    "german_notes.agents.db_helpers",
    "german_notes.agents.enricher",
    "german_notes.agents.enricher_tools",
    "german_notes.agents.quiz_helpers",
    "german_notes.agents.quiz_tools",
    "german_notes.agents.tools",
)


@pytest.fixture
def fake_sb(monkeypatch: pytest.MonkeyPatch) -> Iterator[FakeSupabase]:
    sb = FakeSupabase()

    def _factory() -> FakeSupabase:
        return sb

    for module_path in _BINDING_SITES:
        try:
            __import__(module_path)
        except Exception:
            continue
        monkeypatch.setattr(f"{module_path}.get_supabase", _factory, raising=False)

    yield sb


@pytest.fixture
def client(fake_sb: FakeSupabase) -> Iterator[TestClient]:
    from german_notes.api.main import app

    with TestClient(app) as c:
        yield c
