"""Model client factory and shared constants for the agent layer."""

from __future__ import annotations

from autogen_ext.models.anthropic import AnthropicChatCompletionClient

MODEL_NAME = "claude-sonnet-4-20250514"


def get_model_client() -> AnthropicChatCompletionClient:
    """Return a fresh Anthropic model client.

    Reads ``ANTHROPIC_API_KEY`` from the environment automatically
    (the underlying SDK uses the env var by default).
    """
    return AnthropicChatCompletionClient(model=MODEL_NAME)
