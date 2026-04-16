"""Word enricher agent: proposes data improvements and applies approved ones.

Two entry points:
- ``run_enricher_propose()`` — runs an AutoGen agent that reads words from
  Supabase and collects enrichment proposals in-memory (no writes).
- ``apply_enrichments()`` — pure DB writer that persists user-approved proposals.
"""

from __future__ import annotations

import logging
from typing import Any

from autogen_agentchat.agents import AssistantAgent
from autogen_agentchat.messages import TextMessage
from autogen_core import CancellationToken

from german_notes.agents.config import get_model_client
from german_notes.agents.db_helpers import (
    assign_tags,
    upsert_noun_details,
    upsert_verb_details,
)
from german_notes.agents.enricher_tools import make_enricher_tools
from german_notes.api.supabase_client import get_supabase

logger = logging.getLogger(__name__)

ENRICHER_SYSTEM_PROMPT = """\
You are a German-language data enrichment assistant. Your job is to analyse \
word entries in a vocabulary database and propose completions for missing data.

## Workflow

1. Call ``get_word_schema`` to understand every table, column, type, and \
relationship in the word data model.
2. Call ``fetch_words_to_enrich`` to retrieve words with their current state \
(including translations, grammar details, tags, and explanations).
3. For **each** word returned, compare its current state against the schema \
and call ``propose_word_enrichment`` with ALL missing information:

   - **word_type**: classify as "noun", "verb", "adjective", or "other".
   - **translations**: add missing Spanish ("es") and/or English ("en") translations. \
Do NOT duplicate translations that already exist.
   - **verb_details** (only if word_type is "verb"): provide ``infinitive``, \
``participle`` (past participle), and all present-tense conjugations: \
``present_ich``, ``present_du``, ``present_er``, ``present_wir``, \
``present_ihr``, ``present_sie``.
   - **noun_details** (only if word_type is "noun"): provide ``article`` \
("der", "die", or "das") and ``plural`` (the plural form).
   - **tags**: assign 1-3 relevant topic tags (e.g. "food", "travel", \
"emotions", "Konjunktiv II", "Dativ"). Use lowercase unless it's a German \
grammar term.
   - **explanation**: a brief (1-2 sentence) usage note or context hint in English.

## Rules

- Only propose data that is **missing**. Never overwrite existing values.
- Be accurate with German grammar: articles, conjugations, and plural forms must be correct.
- Translations should be natural, not word-for-word.
- Always call ``propose_word_enrichment`` once per word, even if only a few \
fields are missing.
- After processing all words, finish with a brief summary of what you proposed.\
"""


async def run_enricher_propose(
    limit: int = 10,
    filter_type: str = "all",
    word_ids: list[str] | None = None,
) -> list[dict[str, Any]]:
    """Run the enricher agent and return a list of enrichment proposals.

    If *word_ids* is provided the agent enriches exactly those words;
    otherwise it discovers incomplete words on its own.

    No database writes happen here — proposals are collected in-memory.
    """
    model_client = get_model_client()

    proposals, get_word_schema, fetch_words_to_enrich, propose_word_enrichment = (
        make_enricher_tools(word_ids=word_ids)
    )

    agent = AssistantAgent(
        name="word_enricher",
        model_client=model_client,
        tools=[get_word_schema, fetch_words_to_enrich, propose_word_enrichment],
        system_message=ENRICHER_SYSTEM_PROMPT,
        reflect_on_tool_use=True,
        max_tool_iterations=20,
    )

    if word_ids:
        trigger_text = (
            f"Please enrich the {len(word_ids)} words the user selected. "
            f"Call get_word_schema, then fetch_words_to_enrich, "
            f"then propose_word_enrichment for each word."
        )
    else:
        trigger_text = (
            f"Please enrich up to {limit} words that match "
            f"filter_type='{filter_type}'. "
            f"Call get_word_schema, then fetch_words_to_enrich, "
            f"then propose_word_enrichment for each word."
        )
    trigger = TextMessage(content=trigger_text, source="user")

    try:
        response = await agent.on_messages([trigger], CancellationToken())
        final_text = ""
        if response.chat_message and hasattr(response.chat_message, "content"):
            final_text = str(response.chat_message.content)[:300]
        logger.info(
            "Enricher finished: %d proposals. Response: %s",
            len(proposals), final_text,
        )
    except Exception:
        logger.exception("Enricher agent error")
        raise
    finally:
        await model_client.close()

    return proposals


# ---------------------------------------------------------------------------
# Apply approved enrichments (pure DB writes, no LLM)
# ---------------------------------------------------------------------------

async def apply_enrichments(approved: list[dict[str, Any]]) -> dict[str, Any]:
    """Write user-approved enrichment proposals to Supabase.

    Returns ``{"applied": N, "details": [...]}``.
    """
    sb = get_supabase()
    details: list[dict[str, Any]] = []

    for proposal in approved:
        word_id = proposal["word_id"]
        german = proposal.get("german", "?")
        actions: list[str] = []

        try:
            if "word_type" in proposal:
                sb.table("words").update(
                    {"word_type": proposal["word_type"]}
                ).eq("id", word_id).is_("deleted_at", "null").execute()
                actions.append(f"word_type={proposal['word_type']}")

            if "translations" in proposal:
                existing = (
                    sb.table("translations")
                    .select("language, translation")
                    .eq("word_id", word_id)
                    .is_("deleted_at", "null")
                    .execute()
                    .data
                )
                existing_set = {
                    (t["language"], t["translation"].lower())
                    for t in existing
                }

                new_translations = []
                for t in proposal["translations"]:
                    key = (t["language"], t["translation"].lower())
                    if key not in existing_set:
                        new_translations.append({
                            "word_id": word_id,
                            "language": t["language"],
                            "translation": t["translation"],
                        })

                if new_translations:
                    sb.table("translations").insert(new_translations).execute()
                    actions.append(f"+{len(new_translations)} translations")

            if "verb_details" in proposal:
                upsert_verb_details(sb, word_id, proposal["verb_details"])
                actions.append("verb_details")

            if "noun_details" in proposal:
                upsert_noun_details(sb, word_id, proposal["noun_details"])
                actions.append("noun_details")

            if "tags" in proposal:
                count = assign_tags(sb, word_id, proposal["tags"])
                if count:
                    actions.append(f"+{count} tags")

            if "explanation" in proposal:
                sb.table("explanations").insert({
                    "entity_type": "word",
                    "entity_id": word_id,
                    "content": proposal["explanation"],
                }).execute()
                actions.append("explanation")

            details.append({
                "word_id": word_id,
                "german": german,
                "actions": actions,
                "ok": True,
            })
        except Exception:
            logger.exception("Failed to apply enrichment for word %s", word_id)
            details.append({
                "word_id": word_id,
                "german": german,
                "actions": actions,
                "ok": False,
            })

    applied = sum(1 for d in details if d["ok"])
    return {"applied": applied, "total": len(approved), "details": details}
