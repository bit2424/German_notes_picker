"""Quiz generator agent: creates personalized quizzes from stored vocabulary.

Entry point:
- ``run_quiz_generate()`` — runs an AutoGen agent that fetches words from
  Supabase and generates quiz questions (flashcard + multiple choice).
"""

from __future__ import annotations

import logging
from typing import Any

from autogen_agentchat.agents import AssistantAgent
from autogen_agentchat.messages import TextMessage
from autogen_core import CancellationToken

from german_notes.agents.config import get_model_client
from german_notes.agents.quiz_tools import make_quiz_tools

logger = logging.getLogger(__name__)

QUIZ_SYSTEM_PROMPT = """\
You are a German-language quiz generator. Your job is to create engaging, \
personalized quiz questions from a user's stored vocabulary.

## Workflow

1. Call ``fetch_words_for_quiz`` to get available words with their translations. \
The response includes the user's prompt (if any), requested question count, \
and requested question types.
2. Call ``fetch_all_translations`` to get a pool of translations you can use \
as distractors (wrong answers) for multiple-choice questions.
3. Select words that best match the user's prompt. If the prompt mentions a \
topic, word type, or tag, prioritise matching words. If no prompt was given, \
pick a varied mix.
4. Generate the requested number of questions, mixing the requested types. \
For each question:
   - **flashcard**: show the German word/phrase as the prompt, the correct \
translation as the answer.
   - **multiple_choice**: show the German word as the prompt, provide 4 \
options (1 correct + 3 plausible distractors from the translations pool). \
Shuffle the option order so the correct answer is not always in the same position.
5. Call ``build_quiz`` once with the full list of questions.

## Language Rules (STRICT)

- **All question-facing text must be written entirely in German**: the \
``prompt``, ``hint``, and any explanatory text.
- The ``answer`` field (and ``options`` for multiple-choice) may be in English \
or the target translation language — that is the only allowed exception.
- Do NOT mix German and English inside ``prompt`` or ``hint``. \
"Was bedeutet 'Hund'?" is correct. "What does 'Hund' mean?" is forbidden.

## Question Design Rules

- Prompts should be clear and natural German, \
e.g. "Was bedeutet 'Hund'?" or "Übersetze: die Katze".
- For nouns, include the article in the German text (e.g. "der Hund").
- Distractors must be plausible (same language, similar category if possible) \
but clearly wrong.
- Never repeat the same word in multiple questions.
- If the user asked for more questions than available words, generate as many \
as the words allow.
- Hints are optional: add a short German-language hint only when the word might \
be tricky (e.g. a false friend, irregular conjugation, common mistake). \
Keep hints to one short sentence in German.
- Vary question phrasing to keep it interesting (don't always use the exact \
same template).

## Output

After calling ``build_quiz``, write a brief one-line summary like \
"Generated 10 questions (5 flashcard, 5 multiple choice) from your vocabulary."\
"""


async def run_quiz_generate(
    prompt: str | None = None,
    tag_ids: list[str] | None = None,
    count: int = 10,
    types: list[str] | None = None,
) -> list[dict[str, Any]]:
    """Run the quiz agent and return a list of quiz questions.

    Parameters
    ----------
    prompt : str | None
        Free-text prompt describing what the quiz should focus on.
    tag_ids : list[str] | None
        Tag UUIDs to filter words by.
    count : int
        Number of questions to generate.
    types : list[str] | None
        Question types to include: "flashcard" and/or "multiple_choice".
    """
    model_client = get_model_client()

    questions, fetch_words_for_quiz, fetch_all_translations, build_quiz = (
        make_quiz_tools(tag_ids=tag_ids, prompt=prompt, count=count, types=types)
    )

    agent = AssistantAgent(
        name="quiz_generator",
        model_client=model_client,
        tools=[fetch_words_for_quiz, fetch_all_translations, build_quiz],
        system_message=QUIZ_SYSTEM_PROMPT,
        reflect_on_tool_use=True,
        max_tool_iterations=10,
    )

    parts = []
    if prompt:
        parts.append(f"User prompt: \"{prompt}\"")
    if tag_ids:
        parts.append(f"Filter by tag IDs: {tag_ids}")
    parts.append(f"Generate {count} questions.")
    parts.append(f"Question types: {types or ['flashcard', 'multiple_choice']}")
    parts.append(
        "Call fetch_words_for_quiz, then fetch_all_translations, "
        "then build_quiz with the generated questions."
    )
    trigger_text = " ".join(parts)
    trigger = TextMessage(content=trigger_text, source="user")

    try:
        response = await agent.on_messages([trigger], CancellationToken())
        final_text = ""
        if response.chat_message and hasattr(response.chat_message, "content"):
            final_text = str(response.chat_message.content)[:300]
        logger.info(
            "Quiz generator finished: %d questions. Response: %s",
            len(questions), final_text,
        )
    except Exception:
        logger.exception("Quiz generator agent error")
        raise
    finally:
        await model_client.close()

    return questions
