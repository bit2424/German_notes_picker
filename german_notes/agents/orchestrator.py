"""Main agent orchestrator powered by AutoGen.

Provides ``run_agent()`` — the async entry point called by the FastAPI route.
Internally it wires up an ``AssistantAgent`` with tools, loads prior chat
history from Supabase, and returns the assistant's final text reply.
"""

from __future__ import annotations

import base64
import mimetypes
from typing import Any

from autogen_agentchat.agents import AssistantAgent
from autogen_agentchat.messages import MultiModalMessage, TextMessage
from autogen_core import CancellationToken, Image

from german_notes.agents.config import get_model_client
from german_notes.agents.tools import (
    make_file_tools,
    store_texts,
    store_words,
)

SYSTEM_PROMPT = """\
You are a German-language learning assistant. The user sends you vocabulary, \
notebook photos, and WhatsApp chat exports so you can store and organise their \
German learning material.

Your behaviour:
- When the user sends a new German word with its translation, call store_words.
- When the user sends a German sentence or phrase for review, call store_texts.
- When the user attaches a photo of handwritten notes, call extract_from_image.
- When the user attaches a WhatsApp .txt export, call parse_whatsapp_export.
- You may call multiple tools in a single turn if needed.
- After storing data, confirm what was saved in a friendly, concise reply.
- If the user just wants to chat or asks a question about German, respond directly \
without calling any tool.
- Always reply in the same language the user writes to you (Spanish or English).\
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

    # Trim trailing user messages so the state ends on an assistant turn;
    # the next user turn will be supplied via on_messages().
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


async def run_agent(
    user_text: str,
    uploaded_files: dict[str, bytes] | None = None,
    chat_history: list[dict[str, Any]] | None = None,
) -> str:
    """Send the user message (+ optional files) through the AutoGen agent.

    Returns the assistant's final text response.
    """
    uploaded_files = uploaded_files or {}
    model_client = get_model_client()

    ocr_tool, wa_tool = make_file_tools(uploaded_files)

    agent = AssistantAgent(
        name="german_notes_assistant",
        model_client=model_client,
        tools=[store_words, store_texts, ocr_tool, wa_tool],
        system_message=SYSTEM_PROMPT,
        reflect_on_tool_use=True,
    )

    if chat_history:
        state = _build_state_from_history(chat_history, agent.name)
        await agent.load_state(state)

    user_msg = _build_user_message(user_text, uploaded_files)

    response = await agent.on_messages([user_msg], CancellationToken())

    await model_client.close()
    return _extract_final_text(response)
