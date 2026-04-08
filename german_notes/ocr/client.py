"""Anthropic Claude vision client for notebook OCR.

This module is responsible *only* for extracting raw text lines from an image.
Classification into vocab pairs / sentences is handled by extractor/classifier.py.
"""

from __future__ import annotations

import base64
import json
import mimetypes
from pathlib import Path

import anthropic

from german_notes.ocr.prompt import SYSTEM_PROMPT, USER_PROMPT

_SUPPORTED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}

_MODEL = "claude-sonnet-4-6"


def _encode_image(path: Path) -> tuple[str, str]:
    """Return (base64_data, media_type) for an image file."""
    media_type, _ = mimetypes.guess_type(str(path))
    if media_type is None:
        media_type = "image/jpeg"
    data = path.read_bytes()
    return base64.standard_b64encode(data).decode("ascii"), media_type


def _parse_response(raw: str) -> list[str]:
    """Extract the ``lines`` array from the Claude JSON response."""
    payload = json.loads(raw)
    return [str(line) for line in payload.get("lines", [])]


def extract_from_image(
    image_path: Path,
    *,
    api_key: str,
) -> list[str]:
    """Send a notebook image to Claude Vision and return extracted text lines."""
    if image_path.suffix.lower() not in _SUPPORTED_EXTENSIONS:
        raise ValueError(
            f"Unsupported image format '{image_path.suffix}'. "
            f"Supported: {', '.join(sorted(_SUPPORTED_EXTENSIONS))}"
        )

    b64_data, media_type = _encode_image(image_path)

    client = anthropic.Anthropic(api_key=api_key)
    message = client.messages.create(
        model=_MODEL,
        max_tokens=4096,
        system=SYSTEM_PROMPT,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": media_type,
                            "data": b64_data,
                        },
                    },
                    {
                        "type": "text",
                        "text": USER_PROMPT,
                    },
                ],
            }
        ],
    )

    response_text = message.content[0].text
    return _parse_response(response_text)


def collect_images(input_path: Path) -> list[Path]:
    """Return a sorted list of supported image files from a path.

    If *input_path* is a file, return it as a single-element list.
    If it is a directory, return all supported images found inside (non-recursive).
    """
    if input_path.is_file():
        return [input_path]

    images = [
        p
        for p in sorted(input_path.iterdir())
        if p.is_file() and p.suffix.lower() in _SUPPORTED_EXTENSIONS
    ]
    return images
