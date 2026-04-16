"""Database helpers for quiz persistence: saved quizlets, runs, and review log.

Handles creating/reading quizlets, quiz runs, and per-answer review log entries.
Also provides aggregate queries for word-level and tag-level practice stats.
"""

from __future__ import annotations

import json
import logging
import random
from datetime import datetime, timezone
from typing import Any

from german_notes.api.supabase_client import get_supabase

logger = logging.getLogger(__name__)


def save_quizlet(
    *,
    name: str,
    prompt: str | None,
    tag_ids: list[str] | None,
    questions: list[dict[str, Any]],
    pool_count: int,
    default_question_count: int,
    types: list[str],
    source: str = "generated",
) -> dict[str, Any]:
    """Persist a generated quiz pool as a saved quizlet with its questions and tag links."""
    sb = get_supabase()

    quizlet_row = {
        "name": name,
        "prompt": prompt or "",
        "pool_count": pool_count,
        "default_question_count": default_question_count,
        "types": json.dumps(types),
        "source": source,
    }
    result = sb.table("quizlets").insert(quizlet_row).execute()
    quizlet = result.data[0]
    quizlet_id = quizlet["id"]

    if questions:
        q_rows = []
        for i, q in enumerate(questions):
            q_rows.append({
                "quizlet_id": quizlet_id,
                "position": i,
                "type": q.get("type", "flashcard"),
                "prompt": q.get("prompt", ""),
                "german": q.get("german", ""),
                "answer": q.get("answer", ""),
                "options": json.dumps(q.get("options", [])),
                "hint": q.get("hint", ""),
                "word_id": q.get("word_id") or None,
            })
        sb.table("quizlet_questions").insert(q_rows).execute()

    if tag_ids:
        tag_rows = [{"quizlet_id": quizlet_id, "tag_id": tid} for tid in tag_ids]
        sb.table("quizlet_tags").insert(tag_rows).execute()

    quizlet["question_count"] = len(questions)
    return quizlet


def list_quizlets(limit: int = 50) -> list[dict[str, Any]]:
    """Return saved quizlets ordered by most recently created, with run summary."""
    sb = get_supabase()
    rows = (
        sb.table("quizlets")
        .select("*, quizlet_tags(tag_id, tags(id, name))")
        .is_("deleted_at", "null")
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
        .data
    )

    for row in rows:
        tags = []
        for qt in row.pop("quizlet_tags", []) or []:
            if qt.get("tags"):
                tags.append(qt["tags"])
        row["tags"] = tags

        runs = (
            sb.table("quiz_runs")
            .select("id, score_correct, score_total, completed_at, created_at")
            .eq("quizlet_id", row["id"])
            .is_("deleted_at", "null")
            .order("created_at", desc=True)
            .limit(5)
            .execute()
            .data
        )
        row["runs"] = runs
        row["total_runs"] = len(runs)

    return rows


def get_quizlet_detail(quizlet_id: str) -> dict[str, Any] | None:
    """Fetch a single quizlet with its full question pool and tag links."""
    sb = get_supabase()
    result = (
        sb.table("quizlets")
        .select("*")
        .eq("id", quizlet_id)
        .is_("deleted_at", "null")
        .execute()
    )
    if not result.data:
        return None

    quizlet = result.data[0]

    questions = (
        sb.table("quizlet_questions")
        .select("*")
        .eq("quizlet_id", quizlet_id)
        .is_("deleted_at", "null")
        .order("position")
        .execute()
        .data
    )
    for q in questions:
        if isinstance(q.get("options"), str):
            q["options"] = json.loads(q["options"])
    quizlet["questions"] = questions

    tag_links = (
        sb.table("quizlet_tags")
        .select("tag_id, tags(id, name)")
        .eq("quizlet_id", quizlet_id)
        .execute()
        .data
    )
    quizlet["tags"] = [tl["tags"] for tl in tag_links if tl.get("tags")]

    runs = (
        sb.table("quiz_runs")
        .select("id, question_count, score_correct, score_total, completed_at, created_at")
        .eq("quizlet_id", quizlet_id)
        .is_("deleted_at", "null")
        .order("created_at", desc=True)
        .execute()
        .data
    )
    quizlet["runs"] = runs

    return quizlet


def create_quiz_run(
    quizlet_id: str,
    question_count: int | None = None,
) -> dict[str, Any]:
    """Create a new quiz run, sampling a subset of questions from the saved pool.

    Returns the run record plus the sampled question list.
    """
    sb = get_supabase()

    all_questions = (
        sb.table("quizlet_questions")
        .select("*")
        .eq("quizlet_id", quizlet_id)
        .is_("deleted_at", "null")
        .order("position")
        .execute()
        .data
    )
    if not all_questions:
        raise ValueError("Quizlet has no questions")

    for q in all_questions:
        if isinstance(q.get("options"), str):
            q["options"] = json.loads(q["options"])

    if question_count and question_count < len(all_questions):
        sampled = random.sample(all_questions, question_count)
        sampled.sort(key=lambda q: q["position"])
    else:
        sampled = all_questions
        question_count = len(all_questions)

    now = datetime.now(timezone.utc).isoformat()
    run_row = {
        "quizlet_id": quizlet_id,
        "question_count": question_count,
        "started_at": now,
    }
    result = sb.table("quiz_runs").insert(run_row).execute()
    run = result.data[0]
    run["questions"] = sampled
    return run


def complete_quiz_run(
    run_id: str,
    answers: list[dict[str, Any]],
) -> dict[str, Any]:
    """Persist quiz results: insert review_log rows and update run totals."""
    sb = get_supabase()

    run_result = (
        sb.table("quiz_runs")
        .select("*")
        .eq("id", run_id)
        .is_("deleted_at", "null")
        .execute()
    )
    if not run_result.data:
        raise ValueError("Quiz run not found")
    run = run_result.data[0]

    now = datetime.now(timezone.utc).isoformat()
    correct = 0
    total = 0

    if answers:
        log_rows = []
        for a in answers:
            is_correct = a.get("correct", False)
            if is_correct:
                correct += 1
            total += 1
            log_rows.append({
                "quiz_run_id": run_id,
                "quizlet_question_id": a.get("question_id"),
                "word_id": a.get("word_id") or None,
                "result": "correct" if is_correct else "incorrect",
                "question_type": a.get("question_type", "flashcard"),
            })
        sb.table("review_log").insert(log_rows).execute()

    sb.table("quiz_runs").update({
        "completed_at": now,
        "score_correct": correct,
        "score_total": total,
    }).eq("id", run_id).execute()

    run["completed_at"] = now
    run["score_correct"] = correct
    run["score_total"] = total
    return run


def get_word_practice_stats(word_id: str) -> dict[str, Any]:
    """Return practice statistics for a single word."""
    sb = get_supabase()
    rows = (
        sb.table("review_log")
        .select("result, created_at")
        .eq("word_id", word_id)
        .is_("deleted_at", "null")
        .order("created_at", desc=True)
        .execute()
        .data
    )
    total = len(rows)
    correct = sum(1 for r in rows if r["result"] == "correct")
    last_practiced = rows[0]["created_at"] if rows else None
    return {
        "word_id": word_id,
        "total_attempts": total,
        "correct": correct,
        "accuracy": round(correct / total, 2) if total else None,
        "last_practiced": last_practiced,
    }


def get_bulk_word_practice_stats() -> dict[str, dict[str, Any]]:
    """Return practice stats for all words that have been practiced, keyed by word_id."""
    sb = get_supabase()
    rows = (
        sb.table("review_log")
        .select("word_id, result, created_at")
        .is_("deleted_at", "null")
        .order("created_at", desc=True)
        .execute()
        .data
    )
    if not rows:
        return {}

    acc: dict[str, dict[str, Any]] = {}
    for r in rows:
        wid = r.get("word_id")
        if not wid:
            continue
        if wid not in acc:
            acc[wid] = {
                "word_id": wid,
                "total_attempts": 0,
                "correct": 0,
                "last_practiced": r["created_at"],
            }
        acc[wid]["total_attempts"] += 1
        if r["result"] == "correct":
            acc[wid]["correct"] += 1

    for s in acc.values():
        t = s["total_attempts"]
        s["accuracy"] = round(s["correct"] / t, 2) if t else None

    return acc


def get_tag_practice_stats() -> list[dict[str, Any]]:
    """Return practice stats aggregated by tag via review_log -> words -> word_tags."""
    sb = get_supabase()

    reviews = (
        sb.table("review_log")
        .select("word_id, result")
        .is_("deleted_at", "null")
        .execute()
        .data
    )
    if not reviews:
        return []

    word_ids = list({r["word_id"] for r in reviews if r.get("word_id")})
    if not word_ids:
        return []

    word_tag_links = (
        sb.table("word_tags")
        .select("word_id, tag_id, tags(id, name)")
        .in_("word_id", word_ids)
        .execute()
        .data
    )

    word_to_tags: dict[str, list[dict]] = {}
    for wt in word_tag_links:
        wid = wt["word_id"]
        if wt.get("tags"):
            word_to_tags.setdefault(wid, []).append(wt["tags"])

    tag_stats: dict[str, dict[str, Any]] = {}
    for r in reviews:
        wid = r.get("word_id")
        if not wid or wid not in word_to_tags:
            continue
        for tag in word_to_tags[wid]:
            tid = tag["id"]
            if tid not in tag_stats:
                tag_stats[tid] = {
                    "tag_id": tid,
                    "tag_name": tag["name"],
                    "total_attempts": 0,
                    "correct": 0,
                }
            tag_stats[tid]["total_attempts"] += 1
            if r["result"] == "correct":
                tag_stats[tid]["correct"] += 1

    result = list(tag_stats.values())
    for s in result:
        s["accuracy"] = (
            round(s["correct"] / s["total_attempts"], 2)
            if s["total_attempts"]
            else None
        )
    result.sort(key=lambda s: s["total_attempts"], reverse=True)
    return result


def delete_quizlet(quizlet_id: str) -> bool:
    """Soft-delete a quizlet."""
    sb = get_supabase()
    now = datetime.now(timezone.utc).isoformat()
    result = (
        sb.table("quizlets")
        .update({"deleted_at": now})
        .eq("id", quizlet_id)
        .is_("deleted_at", "null")
        .execute()
    )
    return bool(result.data)
