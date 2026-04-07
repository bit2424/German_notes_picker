"""FastAPI route definitions."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Body, File, Form, HTTPException, UploadFile

from german_notes.agents.orchestrator import run_agent
from german_notes.api.supabase_client import get_supabase

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")


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
        .order("created_at", desc=False)
        .limit(limit)
        .execute()
    )
    return {"messages": result.data}


@router.get("/vocabulary")
async def list_vocabulary(limit: int = 100):
    result = (
        get_supabase()
        .table("vocabulary")
        .select("*")
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return {"vocabulary": result.data}


@router.get("/sentences")
async def list_sentences(limit: int = 100):
    result = (
        get_supabase()
        .table("sentences")
        .select("*")
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return {"sentences": result.data}


# ── Vocabulary CRUD ──────────────────────────────────


@router.patch("/vocabulary/{item_id}")
async def update_vocabulary(item_id: str, fields: dict = Body(...)):
    allowed = {"german", "translation", "translation_lang", "source"}
    updates = {k: v for k, v in fields.items() if k in allowed}
    if not updates:
        raise HTTPException(status_code=400, detail="No valid fields to update")

    result = (
        get_supabase()
        .table("vocabulary")
        .update(updates)
        .eq("id", item_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Vocabulary item not found")
    return result.data[0]


@router.delete("/vocabulary/{item_id}")
async def delete_vocabulary(item_id: str):
    result = (
        get_supabase()
        .table("vocabulary")
        .delete()
        .eq("id", item_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Vocabulary item not found")
    return {"ok": True}


# ── Sentences CRUD ───────────────────────────────────


@router.patch("/sentences/{item_id}")
async def update_sentence(item_id: str, fields: dict = Body(...)):
    allowed = {"sentence", "source"}
    updates = {k: v for k, v in fields.items() if k in allowed}
    if not updates:
        raise HTTPException(status_code=400, detail="No valid fields to update")

    result = (
        get_supabase()
        .table("sentences")
        .update(updates)
        .eq("id", item_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Sentence not found")
    return result.data[0]


@router.delete("/sentences/{item_id}")
async def delete_sentence(item_id: str):
    result = (
        get_supabase()
        .table("sentences")
        .delete()
        .eq("id", item_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Sentence not found")
    return {"ok": True}
