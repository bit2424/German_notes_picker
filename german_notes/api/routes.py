"""FastAPI route definitions."""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone

import anthropic
from fastapi import APIRouter, Body, File, Form, HTTPException, UploadFile

from german_notes.agents.enricher import apply_enrichments, run_enricher_propose
from german_notes.agents.orchestrator import run_agent
from german_notes.agents.quiz_agent import run_quiz_generate
from german_notes.api.supabase_client import get_supabase

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")

_SUGGEST_PROMPT = """\
You are a German-language dictionary assistant. Given a list of German words or \
short expressions, return translation suggestions for each one.

For each word, provide:
- "german": the original word (preserve the user's input, fix obvious typos)
- "word_type": one of "noun", "verb", "adjective", "other"
- "article": the German article ("der", "die", "das") if it is a noun, otherwise null
- "translations": an array of 2-4 translation suggestions, each with:
  - "language": "es" for Spanish or "en" for English
  - "text": the translation

Include at least one Spanish and one English translation per word.

Respond ONLY with valid JSON matching this schema — no markdown, no explanation:
{
  "suggestions": [
    {
      "german": "...",
      "word_type": "noun",
      "article": "die",
      "translations": [
        { "language": "es", "text": "..." },
        { "language": "en", "text": "..." }
      ]
    }
  ]
}
"""


# ── Chats CRUD ───────────────────────────────────────


@router.get("/chats")
async def list_chats():
    result = (
        get_supabase()
        .table("chats")
        .select("*")
        .is_("deleted_at", "null")
        .order("updated_at", desc=True)
        .execute()
    )
    return {"chats": result.data}


@router.post("/chats")
async def create_chat(fields: dict = Body(...)):
    name = fields.get("name", "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="name is required")

    row: dict = {"name": name}
    if fields.get("description"):
        row["description"] = fields["description"]

    result = get_supabase().table("chats").insert(row).execute()
    return result.data[0]


@router.patch("/chats/{chat_id}")
async def update_chat(chat_id: str, fields: dict = Body(...)):
    allowed = {"name", "description"}
    updates = {k: v for k, v in fields.items() if k in allowed}
    if not updates:
        raise HTTPException(status_code=400, detail="No valid fields to update")

    result = (
        get_supabase()
        .table("chats")
        .update(updates)
        .eq("id", chat_id)
        .is_("deleted_at", "null")
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Chat not found")
    return result.data[0]


@router.delete("/chats/{chat_id}")
async def delete_chat(chat_id: str):
    now = datetime.now(timezone.utc).isoformat()
    result = (
        get_supabase()
        .table("chats")
        .update({"deleted_at": now})
        .eq("id", chat_id)
        .is_("deleted_at", "null")
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Chat not found")
    return {"ok": True}


# ── Chat messages (scoped to a chat) ─────────────────


@router.post("/chats/{chat_id}/messages")
async def send_chat_message(
    chat_id: str,
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
        .eq("chat_id", chat_id)
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
            "chat_id": chat_id,
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
        {"chat_id": chat_id, "role": "assistant", "content": assistant_reply}
    ).execute()

    # Touch the chat so the updated_at trigger fires and it sorts to the top
    now = datetime.now(timezone.utc).isoformat()
    get_supabase().table("chats").update({"updated_at": now}).eq("id", chat_id).execute()

    return {"reply": assistant_reply}


@router.get("/chats/{chat_id}/messages")
async def get_chat_messages(chat_id: str, limit: int = 50):
    result = (
        get_supabase()
        .table("chat_messages")
        .select("*")
        .eq("chat_id", chat_id)
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


# ── Translation suggestions ──────────────────────────


@router.post("/suggest-translations")
async def suggest_translations(body: dict = Body(...)):
    words = body.get("words")
    if not words or not isinstance(words, list):
        raise HTTPException(status_code=400, detail="words array is required")

    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    user_content = "Words:\n" + "\n".join(f"- {w}" for w in words)

    try:
        message = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=2048,
            system=_SUGGEST_PROMPT,
            messages=[{"role": "user", "content": user_content}],
        )
        raw = message.content[0].text
        return json.loads(raw)
    except (json.JSONDecodeError, IndexError, KeyError) as exc:
        logger.exception("Failed to parse suggestion response")
        raise HTTPException(status_code=502, detail=f"Bad LLM response: {exc}")
    except anthropic.APIError as exc:
        logger.exception("Anthropic API error")
        raise HTTPException(status_code=502, detail=str(exc))


# ── Batch word storage ───────────────────────────────


@router.post("/words/batch")
async def batch_store_words(body: dict = Body(...)):
    words = body.get("words")
    if not words or not isinstance(words, list):
        raise HTTPException(status_code=400, detail="words array is required")

    sb = get_supabase()

    word_rows = [
        {
            "german": w["german"],
            "word_type": w.get("word_type", "other"),
            "source": w.get("source", "chat"),
        }
        for w in words
    ]
    word_result = sb.table("words").insert(word_rows).execute()

    translation_rows = []
    for w, word_data in zip(words, word_result.data):
        for t in w.get("translations", []):
            lang = t.get("language", "es")
            if lang not in ("es", "en"):
                lang = "es"
            translation_rows.append({
                "word_id": word_data["id"],
                "language": lang,
                "translation": t["translation"],
            })

    if translation_rows:
        sb.table("translations").insert(translation_rows).execute()

    return {
        "stored": len(word_result.data),
        "word_ids": [r["id"] for r in word_result.data],
    }


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


@router.post("/texts")
async def create_text(fields: dict = Body(...)):
    content = fields.get("content", "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="content is required")
    row = {
        "content": content,
        "source": fields.get("source", "manual"),
    }
    result = get_supabase().table("texts").insert(row).execute()
    return result.data[0]


# ── Word detail (full nested fetch) ──────────────────


@router.get("/words/{item_id}")
async def get_word_detail(item_id: str):
    sb = get_supabase()
    word = sb.table("words").select("*, translations(*)").eq("id", item_id).is_("deleted_at", "null").single().execute()
    if not word.data:
        raise HTTPException(status_code=404, detail="Word not found")

    data = word.data
    wt = data.get("word_type", "other")

    if wt == "verb":
        vd = sb.table("verb_details").select("*").eq("word_id", item_id).is_("deleted_at", "null").execute()
        data["verb_details"] = vd.data[0] if vd.data else None
    elif wt == "noun":
        nd = sb.table("noun_details").select("*").eq("word_id", item_id).is_("deleted_at", "null").execute()
        data["noun_details"] = nd.data[0] if nd.data else None
    elif wt == "adjective":
        ad = sb.table("adjective_declensions").select("*").eq("word_id", item_id).is_("deleted_at", "null").execute()
        data["adjective_declensions"] = ad.data

    expl = sb.table("explanations").select("*").eq("entity_type", "word").eq("entity_id", item_id).is_("deleted_at", "null").execute()
    for e in expl.data:
        et = sb.table("explanation_tags").select("tag_id, tags(id, name)").eq("explanation_id", e["id"]).execute()
        e["tags"] = [row["tags"] for row in et.data] if et.data else []
    data["explanations"] = expl.data

    wt_resp = sb.table("word_tags").select("tag_id, tags(id, name)").eq("word_id", item_id).execute()
    data["tags"] = [row["tags"] for row in wt_resp.data] if wt_resp.data else []

    corr = sb.table("corrections").select("*").eq("word_id", item_id).is_("deleted_at", "null").order("created_at", desc=True).execute()
    data["corrections"] = corr.data

    return data


# ── Text detail (full nested fetch) ──────────────────


@router.get("/texts/{item_id}")
async def get_text_detail(item_id: str):
    sb = get_supabase()
    text = sb.table("texts").select("*").eq("id", item_id).is_("deleted_at", "null").single().execute()
    if not text.data:
        raise HTTPException(status_code=404, detail="Text not found")

    data = text.data

    expl = sb.table("explanations").select("*").eq("entity_type", "text").eq("entity_id", item_id).is_("deleted_at", "null").execute()
    for e in expl.data:
        et = sb.table("explanation_tags").select("tag_id, tags(id, name)").eq("explanation_id", e["id"]).execute()
        e["tags"] = [row["tags"] for row in et.data] if et.data else []
    data["explanations"] = expl.data

    tt = sb.table("text_tags").select("tag_id, tags(id, name)").eq("text_id", item_id).execute()
    data["tags"] = [row["tags"] for row in tt.data] if tt.data else []

    corr = sb.table("corrections").select("*").eq("text_id", item_id).is_("deleted_at", "null").order("created_at", desc=True).execute()
    data["corrections"] = corr.data

    tw = sb.table("text_words").select("*, words(id, german)").eq("text_id", item_id).is_("deleted_at", "null").order("position").execute()
    data["text_words"] = tw.data

    return data


# ── Manual word creation ─────────────────────────────


@router.post("/words")
async def create_word(fields: dict = Body(...)):
    german = fields.get("german", "").strip()
    if not german:
        raise HTTPException(status_code=400, detail="german is required")
    row = {
        "german": german,
        "word_type": fields.get("word_type", "other"),
        "source": fields.get("source", "manual"),
    }
    result = get_supabase().table("words").insert(row).execute()
    return result.data[0]


# ── Verb details CRUD ────────────────────────────────


@router.post("/words/{word_id}/verb-details")
async def upsert_verb_details(word_id: str, fields: dict = Body(...)):
    sb = get_supabase()
    existing = sb.table("verb_details").select("id").eq("word_id", word_id).is_("deleted_at", "null").execute()
    allowed_verb = ("infinitive", "participle", "present_ich", "present_du", "present_er", "present_wir", "present_ihr", "present_sie")
    row = {k: v for k, v in fields.items() if k in allowed_verb}
    if existing.data:
        result = sb.table("verb_details").update(row).eq("id", existing.data[0]["id"]).execute()
    else:
        row["word_id"] = word_id
        result = sb.table("verb_details").insert(row).execute()
    return result.data[0]


@router.patch("/verb-details/{item_id}")
async def update_verb_details(item_id: str, fields: dict = Body(...)):
    allowed = {"infinitive", "participle", "present_ich", "present_du", "present_er", "present_wir", "present_ihr", "present_sie"}
    updates = {k: v for k, v in fields.items() if k in allowed}
    if not updates:
        raise HTTPException(status_code=400, detail="No valid fields to update")
    result = get_supabase().table("verb_details").update(updates).eq("id", item_id).is_("deleted_at", "null").execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Verb details not found")
    return result.data[0]


@router.delete("/verb-details/{item_id}")
async def delete_verb_details(item_id: str):
    now = datetime.now(timezone.utc).isoformat()
    result = get_supabase().table("verb_details").update({"deleted_at": now}).eq("id", item_id).is_("deleted_at", "null").execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Verb details not found")
    return {"ok": True}


# ── Noun details CRUD ────────────────────────────────


@router.post("/words/{word_id}/noun-details")
async def upsert_noun_details(word_id: str, fields: dict = Body(...)):
    sb = get_supabase()
    existing = sb.table("noun_details").select("id").eq("word_id", word_id).is_("deleted_at", "null").execute()
    row = {k: v for k, v in fields.items() if k in ("article", "plural")}
    if existing.data:
        result = sb.table("noun_details").update(row).eq("id", existing.data[0]["id"]).execute()
    else:
        row["word_id"] = word_id
        result = sb.table("noun_details").insert(row).execute()
    return result.data[0]


@router.patch("/noun-details/{item_id}")
async def update_noun_details(item_id: str, fields: dict = Body(...)):
    allowed = {"article", "plural"}
    updates = {k: v for k, v in fields.items() if k in allowed}
    if not updates:
        raise HTTPException(status_code=400, detail="No valid fields to update")
    result = get_supabase().table("noun_details").update(updates).eq("id", item_id).is_("deleted_at", "null").execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Noun details not found")
    return result.data[0]


@router.delete("/noun-details/{item_id}")
async def delete_noun_details(item_id: str):
    now = datetime.now(timezone.utc).isoformat()
    result = get_supabase().table("noun_details").update({"deleted_at": now}).eq("id", item_id).is_("deleted_at", "null").execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Noun details not found")
    return {"ok": True}


# ── Adjective declensions CRUD ───────────────────────


@router.post("/words/{word_id}/adjective-declensions")
async def create_adjective_declension(word_id: str, fields: dict = Body(...)):
    case_type = fields.get("case_type")
    gender = fields.get("gender")
    form = fields.get("form", "").strip()
    if not case_type or not gender or not form:
        raise HTTPException(status_code=400, detail="case_type, gender, and form are required")
    row = {"word_id": word_id, "case_type": case_type, "gender": gender, "form": form}
    result = get_supabase().table("adjective_declensions").insert(row).execute()
    return result.data[0]


@router.patch("/adjective-declensions/{item_id}")
async def update_adjective_declension(item_id: str, fields: dict = Body(...)):
    allowed = {"form", "case_type", "gender"}
    updates = {k: v for k, v in fields.items() if k in allowed}
    if not updates:
        raise HTTPException(status_code=400, detail="No valid fields to update")
    result = get_supabase().table("adjective_declensions").update(updates).eq("id", item_id).is_("deleted_at", "null").execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Adjective declension not found")
    return result.data[0]


@router.delete("/adjective-declensions/{item_id}")
async def delete_adjective_declension(item_id: str):
    now = datetime.now(timezone.utc).isoformat()
    result = get_supabase().table("adjective_declensions").update({"deleted_at": now}).eq("id", item_id).is_("deleted_at", "null").execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Adjective declension not found")
    return {"ok": True}


# ── Explanations CRUD (polymorphic) ──────────────────


@router.post("/explanations")
async def create_explanation(fields: dict = Body(...)):
    entity_type = fields.get("entity_type")
    entity_id = fields.get("entity_id")
    content = fields.get("content", "").strip()
    if not entity_type or not entity_id or not content:
        raise HTTPException(status_code=400, detail="entity_type, entity_id, and content are required")
    row = {"entity_type": entity_type, "entity_id": entity_id, "content": content}
    result = get_supabase().table("explanations").insert(row).execute()
    return result.data[0]


@router.patch("/explanations/{item_id}")
async def update_explanation(item_id: str, fields: dict = Body(...)):
    allowed = {"content"}
    updates = {k: v for k, v in fields.items() if k in allowed}
    if not updates:
        raise HTTPException(status_code=400, detail="No valid fields to update")
    result = get_supabase().table("explanations").update(updates).eq("id", item_id).is_("deleted_at", "null").execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Explanation not found")
    return result.data[0]


@router.delete("/explanations/{item_id}")
async def delete_explanation(item_id: str):
    now = datetime.now(timezone.utc).isoformat()
    result = get_supabase().table("explanations").update({"deleted_at": now}).eq("id", item_id).is_("deleted_at", "null").execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Explanation not found")
    return {"ok": True}


# ── Tags CRUD ────────────────────────────────────────


@router.get("/tags")
async def list_tags():
    result = get_supabase().table("tags").select("*").is_("deleted_at", "null").order("name").execute()
    return {"tags": result.data}


@router.post("/tags")
async def create_tag(fields: dict = Body(...)):
    name = fields.get("name", "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="name is required")
    result = get_supabase().table("tags").insert({"name": name}).execute()
    return result.data[0]


@router.delete("/tags/{item_id}")
async def delete_tag(item_id: str):
    now = datetime.now(timezone.utc).isoformat()
    result = get_supabase().table("tags").update({"deleted_at": now}).eq("id", item_id).is_("deleted_at", "null").execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Tag not found")
    return {"ok": True}


# ── Tag assignments (word_tags, text_tags, explanation_tags) ──


@router.post("/words/{word_id}/tags")
async def add_word_tag(word_id: str, fields: dict = Body(...)):
    tag_id = fields.get("tag_id")
    if not tag_id:
        raise HTTPException(status_code=400, detail="tag_id is required")
    result = get_supabase().table("word_tags").insert({"word_id": word_id, "tag_id": tag_id}).execute()
    return result.data[0]


@router.delete("/words/{word_id}/tags/{tag_id}")
async def remove_word_tag(word_id: str, tag_id: str):
    get_supabase().table("word_tags").delete().eq("word_id", word_id).eq("tag_id", tag_id).execute()
    return {"ok": True}


@router.post("/texts/{text_id}/tags")
async def add_text_tag(text_id: str, fields: dict = Body(...)):
    tag_id = fields.get("tag_id")
    if not tag_id:
        raise HTTPException(status_code=400, detail="tag_id is required")
    result = get_supabase().table("text_tags").insert({"text_id": text_id, "tag_id": tag_id}).execute()
    return result.data[0]


@router.delete("/texts/{text_id}/tags/{tag_id}")
async def remove_text_tag(text_id: str, tag_id: str):
    get_supabase().table("text_tags").delete().eq("text_id", text_id).eq("tag_id", tag_id).execute()
    return {"ok": True}


@router.post("/explanations/{expl_id}/tags")
async def add_explanation_tag(expl_id: str, fields: dict = Body(...)):
    tag_id = fields.get("tag_id")
    if not tag_id:
        raise HTTPException(status_code=400, detail="tag_id is required")
    result = get_supabase().table("explanation_tags").insert({"explanation_id": expl_id, "tag_id": tag_id}).execute()
    return result.data[0]


@router.delete("/explanations/{expl_id}/tags/{tag_id}")
async def remove_explanation_tag(expl_id: str, tag_id: str):
    get_supabase().table("explanation_tags").delete().eq("explanation_id", expl_id).eq("tag_id", tag_id).execute()
    return {"ok": True}


# ── Corrections CRUD ─────────────────────────────────


@router.post("/corrections")
async def create_correction(fields: dict = Body(...)):
    word_id = fields.get("word_id")
    text_id = fields.get("text_id")
    if not word_id and not text_id:
        raise HTTPException(status_code=400, detail="word_id or text_id is required")
    if word_id and text_id:
        raise HTTPException(status_code=400, detail="Provide word_id or text_id, not both")
    original_text = fields.get("original_text", "").strip()
    corrected_text = fields.get("corrected_text", "").strip()
    if not original_text or not corrected_text:
        raise HTTPException(status_code=400, detail="original_text and corrected_text are required")
    row: dict = {
        "original_text": original_text,
        "corrected_text": corrected_text,
        "note": fields.get("note", ""),
        "status": "pending",
    }
    if word_id:
        row["word_id"] = word_id
    else:
        row["text_id"] = text_id
    result = get_supabase().table("corrections").insert(row).execute()
    return result.data[0]


@router.patch("/corrections/{item_id}")
async def update_correction(item_id: str, fields: dict = Body(...)):
    allowed = {"status", "note", "corrected_text"}
    updates = {k: v for k, v in fields.items() if k in allowed}
    if not updates:
        raise HTTPException(status_code=400, detail="No valid fields to update")
    result = get_supabase().table("corrections").update(updates).eq("id", item_id).is_("deleted_at", "null").execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Correction not found")
    return result.data[0]


@router.delete("/corrections/{item_id}")
async def delete_correction(item_id: str):
    now = datetime.now(timezone.utc).isoformat()
    result = get_supabase().table("corrections").update({"deleted_at": now}).eq("id", item_id).is_("deleted_at", "null").execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Correction not found")
    return {"ok": True}


# ── Text-word links ──────────────────────────────────


@router.post("/texts/{text_id}/words")
async def link_text_word(text_id: str, fields: dict = Body(...)):
    word_id = fields.get("word_id")
    if not word_id:
        raise HTTPException(status_code=400, detail="word_id is required")
    row = {"text_id": text_id, "word_id": word_id, "position": fields.get("position")}
    result = get_supabase().table("text_words").insert(row).execute()
    return result.data[0]


@router.delete("/text-words/{item_id}")
async def unlink_text_word(item_id: str):
    now = datetime.now(timezone.utc).isoformat()
    result = get_supabase().table("text_words").update({"deleted_at": now}).eq("id", item_id).is_("deleted_at", "null").execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Text-word link not found")
    return {"ok": True}


# ── Quiz generation ──────────────────────────────────


@router.post("/quizzes/generate")
async def generate_quiz(body: dict = Body(...)):
    prompt = body.get("prompt")
    tag_ids = body.get("tag_ids")
    count = body.get("count", 10)
    types = body.get("types", ["flashcard", "multiple_choice"])

    if not prompt and not tag_ids:
        raise HTTPException(
            status_code=400,
            detail="At least one of 'prompt' or 'tag_ids' is required",
        )
    if tag_ids is not None and not isinstance(tag_ids, list):
        raise HTTPException(status_code=400, detail="tag_ids must be an array")
    if not isinstance(count, int) or count < 1:
        raise HTTPException(status_code=400, detail="count must be a positive integer")

    try:
        questions = await run_quiz_generate(
            prompt=prompt,
            tag_ids=tag_ids or None,
            count=count,
            types=types,
        )
    except Exception:
        logger.exception("Quiz generator agent failed")
        raise HTTPException(status_code=502, detail="Quiz generator agent failed")

    return {"questions": questions}


# ── Word enrichment (propose + apply) ────────────────


@router.post("/enrich/words/propose")
async def propose_word_enrichments(body: dict = Body(...)):
    limit = body.get("limit", 10)
    filter_type = body.get("filter", "all")
    word_ids = body.get("word_ids")
    if word_ids is not None and not isinstance(word_ids, list):
        raise HTTPException(status_code=400, detail="word_ids must be an array")
    try:
        proposals = await run_enricher_propose(
            limit=limit, filter_type=filter_type, word_ids=word_ids or None,
        )
    except Exception:
        logger.exception("Enricher agent failed")
        raise HTTPException(status_code=502, detail="Enricher agent failed")
    return {"proposals": proposals}


@router.post("/enrich/words/apply")
async def apply_word_enrichments(body: dict = Body(...)):
    approved = body.get("approved")
    if not approved or not isinstance(approved, list):
        raise HTTPException(status_code=400, detail="approved array is required")
    result = await apply_enrichments(approved)
    return result
