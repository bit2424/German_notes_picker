"""Main agent orchestrator powered by AutoGen.

Provides ``run_agent()`` — the async entry point called by the FastAPI route.
Internally it wires up an ``AssistantAgent`` with tools, loads prior chat
history from Supabase, and returns the assistant's final text reply.

Word storage is delegated to a dedicated intake agent that classifies word
types, generates grammar details, adds bilingual translations, tags, and
explanations. Proposals are returned to the frontend for user review before
being persisted (propose-review-apply pattern).
"""

from __future__ import annotations

import base64
import json
import logging
import mimetypes
from typing import Any

from autogen_agentchat.agents import AssistantAgent
from autogen_agentchat.messages import MultiModalMessage, TextMessage
from autogen_core import CancellationToken, Image

from german_notes.agents.config import get_model_client
from german_notes.agents.intake import run_intake_agent
from german_notes.agents.tools import make_file_tools

logger = logging.getLogger(__name__)

SYSTEM_PROMPT_ENRICH = """\
You are a German-language learning assistant. The user sends you vocabulary, \
notebook photos, and WhatsApp chat exports so you can store and organise their \
German learning material.

Your behaviour:
- When the user sends German words (with or without translations), call \
save_vocabulary. Describe ALL the words and any translations/context the user \
provided. The vocabulary intake system will handle classification, grammar \
details, and bilingual translations automatically.
- When the user attaches a photo of handwritten notes, call extract_from_image.
- When the user attaches a WhatsApp .txt export, call parse_whatsapp_export.
- You may call multiple tools in a single turn if needed.
- After calling save_vocabulary, summarise the proposed words in a friendly, \
concise reply. Include the word type (verb/noun/adjective) and a brief \
translation for each word. Mention that the user will be able to review and \
confirm the proposals before they are saved.
- If the user just wants to chat or asks a question about German, respond directly \
without calling any tool.
- Always reply in English.\
"""

SYSTEM_PROMPT_QUICK = """\
You are a German-language learning assistant. The user sends you vocabulary, \
notebook photos, and WhatsApp chat exports so you can store and organise their \
German learning material.

Your behaviour:
- When the user sends German words (with or without translations), call \
store_words_quick once for EACH word. Classify the word_type yourself based \
on context (verb/noun/adjective/other). Provide a Spanish translation and an \
English translation for each word. If the user already provided translations, \
use those.
- When the user attaches a photo of handwritten notes, call extract_from_image.
- When the user attaches a WhatsApp .txt export, call parse_whatsapp_export.
- You may call multiple tools in a single turn if needed.
- After storing words, summarise what was proposed in a friendly, concise reply. \
Mention that the user will be able to review and confirm before saving.
- If the user just wants to chat or asks a question about German, respond directly \
without calling any tool.
- Always reply in English.\
"""

_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}


def _build_state_from_history(
    chat_history: list[dict[str, Any]],
    agent_name: str,
) -> dict[str, Any]:
    """Convert Supabase ``chat_messages`` rows into an AutoGen agent state dict.

    Anthropic requires strictly alternating user/assistant turns, so
    consecutive same-role messages are merged and empty entries are dropped.
    """
    llm_messages: list[dict[str, Any]] = []

    for msg in chat_history:
        role = msg["role"]
        content = msg.get("content") or ""
        if not content.strip():
            continue

        if role == "user":
            entry = {"content": content, "source": "user", "type": "UserMessage"}
        elif role == "assistant":
            entry = {"content": content, "source": agent_name, "type": "AssistantMessage"}
        else:
            continue

        if llm_messages and llm_messages[-1]["type"] == entry["type"]:
            llm_messages[-1]["content"] += "\n\n" + content
        else:
            llm_messages.append(entry)

    while llm_messages and llm_messages[-1]["type"] == "UserMessage":
        llm_messages.pop()

    return {
        "type": "AssistantAgentState",
        "version": "1.0.0",
        "llm_context": {"messages": llm_messages},
    }


def _build_user_message(
    user_text: str,
    uploaded_files: dict[str, bytes],
) -> TextMessage | MultiModalMessage:
    """Build the appropriate AutoGen message for the user's turn."""
    image_items: list[Image] = []
    text_parts: list[str] = []

    for fname, data in uploaded_files.items():
        lower = fname.lower()
        if any(lower.endswith(ext) for ext in _IMAGE_EXTENSIONS):
            media_type = mimetypes.guess_type(fname)[0] or "image/jpeg"
            b64 = base64.standard_b64encode(data).decode("ascii")
            image_items.append(Image.from_base64(b64, media_type))
        else:
            text_preview = data[:4000].decode("utf-8", errors="replace")
            text_parts.append(f"[Attached file: {fname}]\n{text_preview}")

    if user_text:
        text_parts.append(user_text)

    combined_text = "\n\n".join(text_parts) if text_parts else ""

    if image_items:
        content: list[str | Image] = []
        for img in image_items:
            content.append(img)
        if combined_text:
            content.append(combined_text)
        return MultiModalMessage(content=content, source="user")

    return TextMessage(content=combined_text, source="user")


def _extract_final_text(response) -> str:
    """Pull the plain-text reply out of an AutoGen ``Response``."""
    if response.chat_message is None:
        return "I ran into an issue processing your request. Please try again."
    msg = response.chat_message
    if hasattr(msg, "content") and isinstance(msg.content, str):
        return msg.content
    return str(msg.content)


def _make_save_vocabulary_tool(
    collected_proposals: list[dict[str, Any]],
):
    """Create a ``save_vocabulary`` tool that captures *collected_proposals*.

    Uses the closure pattern (same as make_file_tools / make_intake_tools)
    so proposals are safely scoped to a single request.
    """

    async def save_vocabulary(description: str, source: str = "chat") -> str:
        """Delegate word proposal to the intake agent for full enrichment.

        Pass a natural-language description of the words to store, including
        any translations or context the user provided. The intake agent will
        classify word types, generate grammar details, add bilingual
        translations, assign tags, and write explanations.

        Nothing is written to the database. Proposals are returned for user review.
        """
        result = await run_intake_agent(description, source=source)
        proposals = result.get("proposals", [])
        collected_proposals.extend(proposals)
        logger.info("save_vocabulary collected %d proposals (total %d)", len(proposals), len(collected_proposals))
        return json.dumps({
            "proposed": len(proposals),
            "summary": result.get("summary", ""),
        }, ensure_ascii=False)

    return save_vocabulary


def _make_store_words_quick_tool(
    collected_proposals: list[dict[str, Any]],
):
    """Create a ``store_words_quick`` tool for the quick-save path.

    The orchestrator itself classifies word_type and provides basic
    translations — no LLM intake agent is invoked.
    """

    async def store_words_quick(
        german: str,
        word_type: str = "other",
        translation_es: str = "",
        translation_en: str = "",
        source: str = "chat",
    ) -> str:
        """Quick-store a single German word with basic metadata.

        Args:
            german: The German word or short phrase.
            word_type: One of "verb", "noun", "adjective", "other".
            translation_es: Spanish translation.
            translation_en: English translation.
            source: Where the word came from (default "chat").
        """
        translations = []
        if translation_es:
            translations.append({"language": "es", "translation": translation_es})
        if translation_en:
            translations.append({"language": "en", "translation": translation_en})

        proposal: dict[str, Any] = {
            "type": "word",
            "german": german,
            "word_type": word_type,
            "source": source,
            "translations": translations,
        }
        collected_proposals.append(proposal)
        logger.info(
            "store_words_quick collected '%s' (total %d)",
            german,
            len(collected_proposals),
        )
        return json.dumps(
            {"proposed": german, "word_type": word_type},
            ensure_ascii=False,
        )

    return store_words_quick


async def run_agent(
    user_text: str,
    uploaded_files: dict[str, bytes] | None = None,
    chat_history: list[dict[str, Any]] | None = None,
    *,
    enrich: bool = False,
) -> dict[str, Any]:
    """Send the user message (+ optional files) through the AutoGen agent.

    Returns a dict with:
        - "reply": the assistant's text response
        - "intake_proposals": list of proposed words (empty if none)
    """
    uploaded_files = uploaded_files or {}
    model_client = get_model_client()

    collected_proposals: list[dict[str, Any]] = []

    ocr_tool, wa_tool = make_file_tools(uploaded_files)

    if enrich:
        vocab_tool = _make_save_vocabulary_tool(collected_proposals)
        system_prompt = SYSTEM_PROMPT_ENRICH
    else:
        vocab_tool = _make_store_words_quick_tool(collected_proposals)
        system_prompt = SYSTEM_PROMPT_QUICK

    agent = AssistantAgent(
        name="german_notes_assistant",
        model_client=model_client,
        tools=[vocab_tool, ocr_tool, wa_tool],
        system_message=system_prompt,
        reflect_on_tool_use=True,
    )

    if chat_history:
        state = _build_state_from_history(chat_history, agent.name)
        await agent.load_state(state)

    user_msg = _build_user_message(user_text, uploaded_files)

    response = await agent.on_messages([user_msg], CancellationToken())

    await model_client.close()

    reply_text = _extract_final_text(response)
    logger.info("run_agent done: reply_len=%d, proposals=%d", len(reply_text), len(collected_proposals))

    return {
        "reply": reply_text,
        "intake_proposals": collected_proposals,
    }
