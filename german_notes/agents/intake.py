"""Word intake agent: proposes fully-populated words for user review.

Called by the orchestrator when the user wants to save new German words.
Unlike the bare ``store_words`` tool which only saved german + translation,
this agent classifies word types, generates grammar details, adds
translations in both languages, tags, and explanations.

No database writes happen here. Proposals are returned to the frontend
for user review via a modal, matching the enricher's propose-review-apply
pattern.

Entry point: ``run_intake_agent()``.
"""

from __future__ import annotations

import logging
from typing import Any

from autogen_agentchat.agents import AssistantAgent
from autogen_agentchat.messages import TextMessage
from autogen_core import CancellationToken

from german_notes.agents.config import get_model_client
from german_notes.agents.intake_tools import make_intake_tools

logger = logging.getLogger(__name__)

INTAKE_SYSTEM_PROMPT = """\
You are a German-language vocabulary intake specialist. Your job is to receive \
German words and expressions from a chat conversation and propose them for \
storage with complete, accurate metadata. The user will review your proposals \
before they are saved.

## For EVERY word you receive, you MUST:

1. **Classify the word_type**: "verb", "noun", "adjective", or "other".
2. **Provide translations** in both Spanish ("es") and English ("en"). \
Translations should be natural, not word-for-word. Include 1-2 translations \
per language if the word has multiple common meanings.
3. **Fill grammar details**:
   - For **verbs**: provide verb_details with ``infinitive``, ``participle`` \
(past participle, e.g. "gemacht"), and all Präsens conjugations: \
``present_ich``, ``present_du``, ``present_er``, ``present_wir``, \
``present_ihr``, ``present_sie``. If the verb governs a specific case, \
set ``case_rule`` ("akkusativ", "dativ", or "akkusativ+dativ"). \
Set ``is_reflexive`` to "true" if the verb is reflexive (e.g. sich freuen).
   - For **nouns**: provide noun_details with ``article`` ("der", "die", or \
"das") and ``plural`` (the plural form).
   - For **adjectives** and **other**: no extra details needed.
4. **Assign 1-3 tags**: topic labels like "food", "travel", "emotions", \
"Konjunktiv II", "separable verbs", "formal", etc. Use lowercase unless it's \
a German grammar term.
5. **Write a brief explanation**: 1-2 sentences of usage context in English. \
For verbs, mention if they're separable/inseparable, any idiomatic usage, \
or common collocations. For nouns, mention any irregular plurals or \
compound-word structure.

## Rules

- Call ``propose_complete_word`` once per word.
- If the user also provides German sentences or phrases that are not \
individual vocabulary items, call ``propose_complete_text`` for those. \
Always include translations (both Spanish and English) for texts as well.
- Be accurate with German grammar — articles, conjugations, and plural \
forms must be correct.
- If the user provides a translation, use it but also add the missing \
language (if they gave Spanish, also add English, and vice versa).
- After proposing all words, finish with a brief summary of what you proposed.\
"""


async def run_intake_agent(
    words_description: str,
    source: str = "chat",
) -> dict[str, Any]:
    """Run the intake agent to propose words with full metadata.

    No database writes happen here. Returns proposals for user review.

    Parameters
    ----------
    words_description : str
        Natural-language description of the words to store, including any
        translations or context the user provided.
    source : str
        Origin label: "chat", "whatsapp", "notebook", "manual".

    Returns
    -------
    dict with keys:
        - "proposals": list of proposed word dicts (not yet persisted)
        - "summary": the agent's natural-language summary
    """
    model_client = get_model_client()
    proposals, propose_complete_word, propose_complete_text = make_intake_tools()

    agent = AssistantAgent(
        name="word_intake",
        model_client=model_client,
        tools=[propose_complete_word, propose_complete_text],
        system_message=INTAKE_SYSTEM_PROMPT,
        reflect_on_tool_use=True,
        max_tool_iterations=25,
    )

    trigger = TextMessage(
        content=(
            f"Please propose the following words/expressions with complete metadata. "
            f"Source: {source}.\n\n{words_description}"
        ),
        source="user",
    )

    try:
        response = await agent.on_messages([trigger], CancellationToken())
        summary = ""
        if response.chat_message and hasattr(response.chat_message, "content"):
            summary = str(response.chat_message.content)
    except Exception:
        logger.exception("Intake agent error")
        raise
    finally:
        await model_client.close()

    return {
        "proposals": proposals,
        "summary": summary,
    }
