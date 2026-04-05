"""Main agent: routes user messages to the right tools via Claude tool-use."""

from __future__ import annotations

import json
import os
from typing import Any

import anthropic

from german_notes.api.tools import (
    extract_from_image,
    parse_whatsapp_export,
    store_sentences,
    store_vocabulary,
)

_MODEL = "claude-sonnet-4-20250514"

SYSTEM_PROMPT = """\
You are a German-language learning assistant. The user sends you vocabulary, \
notebook photos, and WhatsApp chat exports so you can store and organise their \
German learning material.

Your behaviour:
- When the user sends a new German word with its translation, call store_vocabulary.
- When the user sends a German sentence for review, call store_sentences.
- When the user attaches a photo of handwritten notes, call extract_from_image.
- When the user attaches a WhatsApp .txt export, call parse_whatsapp_export.
- You may call multiple tools in a single turn if needed.
- After storing data, confirm what was saved in a friendly, concise reply.
- If the user just wants to chat or asks a question about German, respond directly \
without calling any tool.
- Always reply in the same language the user writes to you (Spanish or English).\
"""

TOOL_DEFINITIONS: list[dict[str, Any]] = [
    {
        "name": "store_vocabulary",
        "description": (
            "Store one or more German vocabulary pairs (word + translation). "
            "Use when the user provides a German word and its meaning."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "entries": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "german": {
                                "type": "string",
                                "description": "The German word or phrase",
                            },
                            "translation": {
                                "type": "string",
                                "description": "Translation in Spanish or English",
                            },
                            "translation_lang": {
                                "type": "string",
                                "enum": ["es", "en", "unknown"],
                                "description": "Language of the translation",
                            },
                        },
                        "required": ["german", "translation"],
                    },
                    "description": "List of vocab pairs to store",
                }
            },
            "required": ["entries"],
        },
    },
    {
        "name": "store_sentences",
        "description": (
            "Store one or more German sentences for grammar review. "
            "Use when the user provides full German sentences."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "entries": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "sentence": {
                                "type": "string",
                                "description": "A complete German sentence",
                            },
                        },
                        "required": ["sentence"],
                    },
                    "description": "List of sentences to store",
                }
            },
            "required": ["entries"],
        },
    },
    {
        "name": "extract_from_image",
        "description": (
            "Extract German vocabulary and sentences from a photo of handwritten "
            "notebook notes using OCR. The image has already been uploaded by the "
            "user; this tool triggers OCR processing and storage."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "filename": {
                    "type": "string",
                    "description": "Original filename of the uploaded image",
                }
            },
            "required": ["filename"],
        },
    },
    {
        "name": "parse_whatsapp_export",
        "description": (
            "Parse a WhatsApp .txt chat export to extract German vocabulary and "
            "sentences. The file has already been uploaded; this triggers parsing."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "filename": {
                    "type": "string",
                    "description": "Original filename of the uploaded .txt file",
                }
            },
            "required": ["filename"],
        },
    },
]


def _execute_tool(
    tool_name: str,
    tool_input: dict[str, Any],
    uploaded_files: dict[str, bytes],
) -> str:
    """Run a tool and return its JSON result."""
    if tool_name == "store_vocabulary":
        result = store_vocabulary(tool_input["entries"])
    elif tool_name == "store_sentences":
        result = store_sentences(tool_input["entries"])
    elif tool_name == "extract_from_image":
        fname = tool_input["filename"]
        image_bytes = uploaded_files.get(fname, b"")
        if not image_bytes:
            return json.dumps({"error": f"Image file '{fname}' not found in upload"})
        api_key = os.environ["ANTHROPIC_API_KEY"]
        result = extract_from_image(image_bytes, fname, api_key)
    elif tool_name == "parse_whatsapp_export":
        fname = tool_input["filename"]
        file_bytes = uploaded_files.get(fname, b"")
        if not file_bytes:
            return json.dumps({"error": f"File '{fname}' not found in upload"})
        result = parse_whatsapp_export(file_bytes, fname)
    else:
        result = {"error": f"Unknown tool: {tool_name}"}

    return json.dumps(result)


def run_agent(
    user_text: str,
    uploaded_files: dict[str, bytes] | None = None,
    chat_history: list[dict[str, Any]] | None = None,
) -> str:
    """Send the user message (+ optional files) through the agent loop.

    Returns the assistant's final text response.
    """
    uploaded_files = uploaded_files or {}
    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

    user_content: list[dict[str, Any]] = []

    for fname, data in uploaded_files.items():
        lower = fname.lower()
        if lower.endswith((".jpg", ".jpeg", ".png", ".webp", ".gif")):
            import base64
            import mimetypes

            media_type = mimetypes.guess_type(fname)[0] or "image/jpeg"
            user_content.append(
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": media_type,
                        "data": base64.standard_b64encode(data).decode("ascii"),
                    },
                }
            )
        else:
            text_preview = data[:4000].decode("utf-8", errors="replace")
            user_content.append(
                {
                    "type": "text",
                    "text": f"[Attached file: {fname}]\n{text_preview}",
                }
            )

    if user_text:
        user_content.append({"type": "text", "text": user_text})

    messages: list[dict[str, Any]] = []
    if chat_history:
        messages.extend(chat_history)
    messages.append({"role": "user", "content": user_content})

    MAX_TOOL_ROUNDS = 5
    for _ in range(MAX_TOOL_ROUNDS):
        response = client.messages.create(
            model=_MODEL,
            max_tokens=4096,
            system=SYSTEM_PROMPT,
            tools=TOOL_DEFINITIONS,
            messages=messages,
        )

        if response.stop_reason == "tool_use":
            tool_results = []
            for block in response.content:
                if block.type == "tool_use":
                    result_json = _execute_tool(
                        block.name, block.input, uploaded_files
                    )
                    tool_results.append(
                        {
                            "type": "tool_result",
                            "tool_use_id": block.id,
                            "content": result_json,
                        }
                    )

            messages.append({"role": "assistant", "content": response.content})
            messages.append({"role": "user", "content": tool_results})
        else:
            text_parts = [
                block.text for block in response.content if hasattr(block, "text")
            ]
            return "\n".join(text_parts)

    return "I ran into an issue processing your request. Please try again."
