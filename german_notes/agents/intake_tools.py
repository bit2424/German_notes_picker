"""Word intake agent tools: propose fully-populated words from chat conversations.

The intake agent receives word data from the orchestrator and collects
proposals in-memory. No database writes happen here -- proposals are
returned to the frontend for user review before being applied.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Callable

logger = logging.getLogger(__name__)


def make_intake_tools() -> tuple[list[dict[str, Any]], Callable, Callable]:
    """Return ``(proposals_list, propose_complete_word, propose_complete_text)``.

    The *proposals_list* accumulates proposed words in-memory (no DB writes)
    and is read by the caller after the agent finishes.
    """
    proposals: list[dict[str, Any]] = []

    async def propose_complete_word(
        german: str,
        word_type: str,
        translations: list[dict[str, str]],
        verb_details: dict[str, str] | None = None,
        noun_details: dict[str, str] | None = None,
        tags: list[str] | None = None,
        explanation: str | None = None,
        source: str = "chat",
    ) -> str:
        """Propose a German word with full metadata for user review.

        Nothing is written to the database. The proposal is collected
        in-memory and returned to the frontend for approval.

        Parameters
        ----------
        german : str
            The German word or expression.
        word_type : str
            One of "verb", "noun", "adjective", "other".
        translations : list[dict]
            Each dict has "language" ("es" or "en") and "translation".
            Include at least one Spanish and one English translation.
        verb_details : dict, optional
            Required when word_type is "verb". Keys: "infinitive", "participle",
            "present_ich", "present_du", "present_er", "present_wir",
            "present_ihr", "present_sie". Optionally: "case_rule"
            ("akkusativ", "dativ", "akkusativ+dativ"), "is_reflexive" (bool).
        noun_details : dict, optional
            Required when word_type is "noun". Keys: "article" ("der"/"die"/"das"),
            "plural" (the plural form).
        tags : list[str], optional
            1-3 topic tags (e.g. "food", "travel", "Konjunktiv II").
        explanation : str, optional
            A brief (1-2 sentence) usage note or context hint in English.
        source : str
            Origin of the word: "chat", "whatsapp", "notebook", "manual".
        """
        proposal: dict[str, Any] = {
            "german": german,
            "word_type": word_type,
            "source": source,
            "translations": translations,
        }
        if verb_details:
            proposal["verb_details"] = verb_details
        if noun_details:
            proposal["noun_details"] = noun_details
        if tags:
            proposal["tags"] = tags
        if explanation:
            proposal["explanation"] = explanation

        proposals.append(proposal)
        logger.info("Intake proposal recorded for '%s' (%s, total: %d)", german, word_type, len(proposals))
        return json.dumps({"german": german, "word_type": word_type, "proposed": True})

    async def propose_complete_text(
        content: str,
        translations: list[dict[str, str]] | None = None,
        source: str = "chat",
    ) -> str:
        """Propose a German text (sentence, phrase, or short paragraph) for user review.

        Nothing is written to the database.

        Parameters
        ----------
        content : str
            The German text to store.
        translations : list[dict], optional
            Each dict has "language" ("es" or "en") and "translation".
            Provide at least one Spanish and one English translation of the text.
        source : str
            Origin: "chat", "whatsapp", "notebook", "manual".
        """
        proposal: dict[str, Any] = {
            "type": "text",
            "content": content,
            "source": source,
        }
        if translations:
            proposal["translations"] = translations
        proposals.append(proposal)
        logger.info("Intake text proposal recorded: '%s'", content[:40])
        return json.dumps({"content": content[:80], "proposed": True})

    return proposals, propose_complete_word, propose_complete_text
