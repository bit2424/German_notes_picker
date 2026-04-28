"""In-memory fake of the supabase-py client chain API.

Supports only the subset of methods exercised by ``german_notes`` code under
test: ``.table(name).select(...) / .insert(...) / .update(...)`` chained with
``.eq(col, val)`` and ``.is_(col, val)`` filters and terminated by
``.execute()`` returning an object with a ``.data`` attribute.

The fake auto-fills ``id`` (uuid4), ``created_at``, ``updated_at`` and
``deleted_at`` on insert so callers see the same shape they would from a real
Postgres row.
"""

from __future__ import annotations

import uuid
from copy import deepcopy
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any


@dataclass
class _Result:
    data: list[dict[str, Any]] = field(default_factory=list)


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


class FakeSupabase:
    def __init__(self) -> None:
        self.tables: dict[str, list[dict[str, Any]]] = {}

    def table(self, name: str) -> _Builder:
        self.tables.setdefault(name, [])
        return _Builder(self, name)

    def seed(self, table: str, rows: list[dict[str, Any]]) -> None:
        """Pre-populate a table for tests that need existing rows."""
        bucket = self.tables.setdefault(table, [])
        for row in rows:
            new_row = dict(row)
            new_row.setdefault("id", str(uuid.uuid4()))
            new_row.setdefault("created_at", _now_iso())
            new_row.setdefault("updated_at", _now_iso())
            new_row.setdefault("deleted_at", None)
            bucket.append(new_row)


class _Builder:
    def __init__(self, sb: FakeSupabase, table: str) -> None:
        self._sb = sb
        self._table = table
        self._mode: str | None = None
        self._payload: list[dict[str, Any]] | dict[str, Any] | None = None
        self._filters: list[tuple[str, str, Any]] = []
        self._order: tuple[str, bool] | None = None

    # ── mode setters ──
    def select(self, _columns: str = "*") -> _Builder:
        self._mode = "select"
        return self

    def insert(self, payload: dict[str, Any] | list[dict[str, Any]]) -> _Builder:
        self._mode = "insert"
        self._payload = payload
        return self

    def update(self, payload: dict[str, Any]) -> _Builder:
        self._mode = "update"
        self._payload = payload
        return self

    def delete(self) -> _Builder:
        self._mode = "delete"
        return self

    # ── filters ──
    def eq(self, column: str, value: Any) -> _Builder:
        self._filters.append(("eq", column, value))
        return self

    def is_(self, column: str, value: Any) -> _Builder:
        # supabase-py uses the literal string "null" for IS NULL checks.
        self._filters.append(("is", column, value))
        return self

    def order(self, column: str, desc: bool = False) -> _Builder:
        self._order = (column, desc)
        return self

    # ── terminal ──
    def execute(self) -> _Result:
        if self._mode == "select":
            return _Result(data=deepcopy(self._matching_rows()))
        if self._mode == "insert":
            return _Result(data=self._do_insert())
        if self._mode == "update":
            return _Result(data=self._do_update())
        if self._mode == "delete":
            return _Result(data=self._do_delete())
        raise RuntimeError(f"FakeSupabase: execute() called without a mode on {self._table!r}")

    # ── internals ──
    def _matches(self, row: dict[str, Any]) -> bool:
        for op, column, value in self._filters:
            if op == "eq":
                if row.get(column) != value:
                    return False
            elif op == "is":
                # ``is_("col", "null")`` means "IS NULL"; otherwise compare directly.
                if value == "null" or value is None:
                    if row.get(column) is not None:
                        return False
                else:
                    if row.get(column) is not value:
                        return False
        return True

    def _matching_rows(self) -> list[dict[str, Any]]:
        rows = [r for r in self._sb.tables[self._table] if self._matches(r)]
        if self._order is not None:
            column, desc = self._order
            rows = sorted(rows, key=lambda r: r.get(column) or "", reverse=desc)
        return rows

    def _do_insert(self) -> list[dict[str, Any]]:
        payload = self._payload
        rows = payload if isinstance(payload, list) else [payload]  # type: ignore[list-item]
        inserted: list[dict[str, Any]] = []
        for raw in rows:
            new_row = dict(raw)
            new_row.setdefault("id", str(uuid.uuid4()))
            new_row.setdefault("created_at", _now_iso())
            new_row.setdefault("updated_at", _now_iso())
            new_row.setdefault("deleted_at", None)
            self._sb.tables[self._table].append(new_row)
            inserted.append(deepcopy(new_row))
        return inserted

    def _do_update(self) -> list[dict[str, Any]]:
        assert isinstance(self._payload, dict)
        updated: list[dict[str, Any]] = []
        for row in self._sb.tables[self._table]:
            if self._matches(row):
                row.update(self._payload)
                row["updated_at"] = _now_iso()
                updated.append(deepcopy(row))
        return updated

    def _do_delete(self) -> list[dict[str, Any]]:
        deleted: list[dict[str, Any]] = []
        remaining: list[dict[str, Any]] = []
        for row in self._sb.tables[self._table]:
            if self._matches(row):
                deleted.append(deepcopy(row))
            else:
                remaining.append(row)
        self._sb.tables[self._table] = remaining
        return deleted
