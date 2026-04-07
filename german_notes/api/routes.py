"""FastAPI route definitions."""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Body, File, Form, HTTPException, UploadFile

from german_notes.agents.orchestrator import run_agent
from german_notes.api.supabase_client import get_supabase

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")


# ── Chat ─────────────────────────────────────────────


@router.post("/chat")
async def chat(
    message: str = Form(""),
    files: list[UploadFile] = File(default=[]),
):
    uploaded: dict[str, bytes] = {}
    attachment_meta: list[dict] = []

    for f in files:
        data = await f.read()
        uploaded[f.filename] = data
        attachment_meta.append({"filename": f.filename, "size": len(data)})

    history_resp = (
        get_supabase()
        .table("chat_messages")
        .select("role, content")
        .is_("deleted_at", "null")
        .order("created_at", desc=False)
        .limit(20)
        .execute()
    )
    chat_history = [
        {"role": m["role"], "content": m["content"]} for m in history_resp.data
    ]

    get_supabase().table("chat_messages").insert(
        {
            "role": "user",
            "content": message,
            "attachments": attachment_meta if attachment_meta else None,
        }
    ).execute()

    try:
        assistant_reply = await run_agent(message, uploaded, chat_history)
    except Exception as exc:
        logger.exception("Agent error")
        raise HTTPException(status_code=502, detail=str(exc))

    get_supabase().table("chat_messages").insert(
        {"role": "assistant", "content": assistant_reply}
    ).execute()

    return {"reply": assistant_reply}


@router.get("/chat/history")
async def chat_history(limit: int = 50):
    result = (
        get_supabase()
        .table("chat_messages")
        .select("*")
        .is_("deleted_at", "null")
        .order("created_at", desc=False)
        .limit(limit)
        .execute()
    )
    return {"messages": result.data}


# ── Words (with nested translations) ────────────────


@router.get("/words")
async def list_words(limit: int = 200):
    result = (
        get_supabase()
        .table("words")
        .select("*, translations(*)")
        .is_("deleted_at", "null")
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return {"words": result.data}


@router.patch("/words/{item_id}")
async def update_word(item_id: str, fields: dict = Body(...)):
    allowed = {"german", "word_type", "source"}
    updates = {k: v for k, v in fields.items() if k in allowed}
    if not updates:
        raise HTTPException(status_code=400, detail="No valid fields to update")

    result = (
        get_supabase()
        .table("words")
        .update(updates)
        .eq("id", item_id)
        .is_("deleted_at", "null")
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Word not found")
    return result.data[0]


@router.delete("/words/{item_id}")
async def delete_word(item_id: str):
    now = datetime.now(timezone.utc).isoformat()
    result = (
        get_supabase()
        .table("words")
        .update({"deleted_at": now})
        .eq("id", item_id)
        .is_("deleted_at", "null")
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Word not found")
    return {"ok": True}


# ── Translations CRUD ────────────────────────────────


@router.post("/words/{word_id}/translations")
async def add_translation(word_id: str, fields: dict = Body(...)):
    language = fields.get("language")
    translation = fields.get("translation")
    if not language or not translation:
        raise HTTPException(status_code=400, detail="language and translation required")
    if language not in ("es", "en"):
        raise HTTPException(status_code=400, detail="language must be 'es' or 'en'")

    row = {"word_id": word_id, "language": language, "translation": translation}
    result = get_supabase().table("translations").insert(row).execute()
    return result.data[0]


@router.patch("/translations/{item_id}")
async def update_translation(item_id: str, fields: dict = Body(...)):
    allowed = {"language", "translation"}
    updates = {k: v for k, v in fields.items() if k in allowed}
    if not updates:
        raise HTTPException(status_code=400, detail="No valid fields to update")

    result = (
        get_supabase()
        .table("translations")
        .update(updates)
        .eq("id", item_id)
        .is_("deleted_at", "null")
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Translation not found")
    return result.data[0]


@router.delete("/translations/{item_id}")
async def delete_translation(item_id: str):
    now = datetime.now(timezone.utc).isoformat()
    result = (
        get_supabase()
        .table("translations")
        .update({"deleted_at": now})
        .eq("id", item_id)
        .is_("deleted_at", "null")
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Translation not found")
    return {"ok": True}


# ── Texts CRUD ───────────────────────────────────────


@router.get("/texts")
async def list_texts(limit: int = 200):
    result = (
        get_supabase()
        .table("texts")
        .select("*")
        .is_("deleted_at", "null")
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return {"texts": result.data}


@router.patch("/texts/{item_id}")
async def update_text(item_id: str, fields: dict = Body(...)):
    allowed = {"content", "source"}
    updates = {k: v for k, v in fields.items() if k in allowed}
    if not updates:
        raise HTTPException(status_code=400, detail="No valid fields to update")

    result = (
        get_supabase()
        .table("texts")
        .update(updates)
        .eq("id", item_id)
        .is_("deleted_at", "null")
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Text not found")
    return result.data[0]


@router.delete("/texts/{item_id}")
async def delete_text(item_id: str):
    now = datetime.now(timezone.utc).isoformat()
    result = (
        get_supabase()
        .table("texts")
        .update({"deleted_at": now})
        .eq("id", item_id)
        .is_("deleted_at", "null")
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Text not found")
    return {"ok": True}
