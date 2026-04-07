# German Notes -- Agent Instructions

## Project Goal

Build a personal **German-language "second brain"**: a chat-based agentic system where the user (Nelson) can throw in learning material from any source -- a photo of handwritten notes, a text message with a new word, a WhatsApp export -- and an orchestrating agent decides how to ingest, store, and eventually quiz on that material.

The user communicates in **Spanish or English**. The stored content is **German** paired with Spanish/English translations.

## High-Level Architecture

```
User (React chat UI)
  |
  POST /api/chat  (multipart: text + files)
  |
  FastAPI backend (api/routes.py)
  |
  AutoGen AssistantAgent (agents/orchestrator.py)
  |  powered by AnthropicChatCompletionClient (Claude)
  |
  |--- store_vocabulary     -> Supabase `vocabulary` table
  |--- store_sentences      -> Supabase `sentences` table
  |--- extract_from_image   -> OCR (raw text) -> classifier.py -> store
  |--- parse_whatsapp_export-> parser.py -> classifier.py -> store
  |--- [FUTURE] generate_quizlet
  |--- [FUTURE] explain_topic
```

The agent is powered by **AutoGen** (`autogen-agentchat` + `autogen-ext[anthropic]`). Tools are plain async Python functions registered with an `AssistantAgent`. Adding a new capability = adding a tool function in `agents/tools.py`.

All extraction pipelines (OCR, WhatsApp) feed through `extractor/classifier.py` as the single source of truth for classifying content into vocab pairs vs. German sentences. The OCR module only extracts raw text lines; classification is always done downstream.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Language | Python 3.11+, TypeScript |
| Package manager | Poetry (backend), npm (frontend) |
| Backend framework | FastAPI + Uvicorn |
| Frontend | React 19 + Vite + TypeScript |
| Agent framework | AutoGen (`autogen-agentchat`, `autogen-ext[anthropic]`) |
| LLM | Anthropic Claude (claude-sonnet-4-20250514) via AutoGen's `AnthropicChatCompletionClient` |
| Database | Supabase Postgres (project: `xbxaujxiltreasmmgewi`) |
| Supabase client | `supabase-py` (Python), anon key auth, RLS disabled |

## Running the App

```bash
# Backend (port 8001, 8000 is occupied by another service)
poetry run uvicorn german_notes.api.main:app --reload --port 8001

# Frontend
cd frontend && npm run dev
```

Environment variables live in `.env` (gitignored). Required keys: `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_KEY`.

## Database Schema (Supabase)

Three tables, all with RLS disabled for personal use:

- **`vocabulary`** -- `id` (uuid PK), `german` (text), `translation` (text), `translation_lang` (text), `source` (text: "whatsapp"/"notebook"/"chat"), `date` (text), `sender` (text), `raw_message` (text), `created_at` (timestamptz)
- **`sentences`** -- `id` (uuid PK), `sentence` (text), `source` (text), `date` (text), `sender` (text), `created_at` (timestamptz)
- **`chat_messages`** -- `id` (uuid PK), `role` (text: "user"/"assistant"), `content` (text), `attachments` (jsonb), `created_at` (timestamptz)

Indexes exist on `created_at DESC` for all three tables.

## Database Conventions

Follow these rules when creating new tables, adding columns, or making any schema changes. All DDL must be executed through the Supabase SQL Editor (or via a migration file if we add a migration tool later).

### Primary Keys

- Use `uuid` as the PK type for all tables (consistent with the existing schema).
- Use `gen_random_uuid()` as the default. If the `pg_uuidv7` extension is available, prefer `uuid_generate_v7()` for time-ordered IDs with better index locality.
- Column name: always `id`.

### Timestamps

- Every table **must** have `created_at timestamptz not null default now()`.
- Every table **must** have `updated_at timestamptz not null default now()` with a trigger that auto-updates it on row modification.
- Always use `timestamptz`, never `timestamp`.

### Soft Deletes

- Every table **must** have a `deleted_at timestamptz` column (nullable, default `null`).
- A row is considered active when `deleted_at IS NULL`.
- Never use hard `DELETE` in application code. Instead, set `deleted_at = now()`.
- All queries must include `WHERE deleted_at IS NULL` unless explicitly recovering deleted data.
- Add a partial index on `deleted_at` for efficient filtering of active rows:

### Foreign Keys

- Always define explicit foreign key constraints between related tables.
- Use `references <table>(id)` syntax.
- Choose the appropriate `ON DELETE` behavior:
  - `on delete cascade` -- when child rows have no meaning without the parent.
  - `on delete set null` -- when the child can exist independently but the link is optional.
  - `on delete restrict` (default) -- when deleting a parent with children should be an error.
- **Always create an index on every FK column.** Postgres does not auto-index FK columns, and missing indexes cause slow JOINs and CASCADE operations.

### Naming Conventions

- Table names: **lowercase `snake_case`**, plural (e.g., `vocabulary`, `sentences`, `chat_messages`).
- Column names: **lowercase `snake_case`**.
- Index names: `<table>_<column(s)>_idx` (e.g., `sentences_vocabulary_id_idx`).
- FK constraint names: `<child_table>_<column>_fkey` (e.g., `sentences_vocabulary_id_fkey`).
- Trigger names: `set_updated_at` (reuse the same function, one trigger per table).

### Migration Discipline

- Document every schema change in `CHANGELOG.md` with the exact SQL executed.
- When adding columns to existing tables, always provide a `DEFAULT` or make them nullable to avoid breaking existing rows.
- When renaming or removing columns, do it in two steps: (1) add the new column / stop using the old one in code, (2) drop the old column after verifying nothing references it.
- Before running destructive DDL (`DROP`, `ALTER ... DROP COLUMN`), confirm with the user.

## Code Map

### Backend (`german_notes/`)

| Module | Purpose |
|--------|---------|
| `agents/orchestrator.py` | AutoGen `AssistantAgent` setup, `run_agent()` async entry point, chat history loading |
| `agents/tools.py` | AutoGen tool functions + shared `classify_and_store()` pipeline |
| `agents/config.py` | Model client factory (`AnthropicChatCompletionClient`) |
| `core/models.py` | Shared dataclasses: `Message`, `VocabPair`, `GermanSentence` |
| `core/writers.py` | CSV writers (legacy CLI, still works) |
| `extractor/parser.py` | WhatsApp German-locale `.txt` parser (regex-based) |
| `extractor/classifier.py` | Heuristic classifier: single source of truth for vocab pair / sentence detection |
| `extractor/cli.py` | Standalone CLI for WhatsApp extraction |
| `ocr/prompt.py` | System/user prompts for Claude Vision OCR (raw text extraction only) |
| `ocr/client.py` | Sends images to Claude Vision, returns raw text lines (`list[str]`) |
| `ocr/cli.py` | Standalone CLI for notebook OCR |
| `api/main.py` | FastAPI app, CORS, lifespan (dotenv loading) |
| `api/routes.py` | REST endpoints: `POST /api/chat`, `GET /api/chat/history`, `GET /api/vocabulary`, `GET /api/sentences` |
| `api/tools.py` | Legacy tool handlers (kept for reference; agents/tools.py is the active version) |
| `api/supabase_client.py` | `get_supabase()` singleton via `lru_cache` |

### Frontend (`frontend/`)

| File | Purpose |
|------|---------|
| `src/App.tsx` | Main chat layout, message state, send handler |
| `src/api.ts` | `sendMessage()` and `fetchHistory()` -- talks to FastAPI backend on port 8001 |
| `src/components/ChatInput.tsx` | Text input + file upload (`+` button), file previews |
| `src/components/ChatMessage.tsx` | Message bubble (user vs assistant styling) |
| `src/App.css` | All styles: layout, messages, typing indicator, input bar, file previews |
| `src/index.css` | CSS variables, dark/light mode via `prefers-color-scheme` |

## Design Decisions

1. **AutoGen for orchestration.** The agent uses Microsoft AutoGen's `AssistantAgent` with `AnthropicChatCompletionClient`. Tools are plain async Python functions. This replaces the hand-rolled Claude tool-use loop and enables future evolution to a multi-agent `Swarm` (where OCR, extractor, and flashcard agents each have specialised roles and hand off to each other).

2. **Classifier as single source of truth.** Both OCR and WhatsApp pipelines feed raw text through `extractor/classifier.py`. The OCR module only transcribes; it does not classify. This keeps classification logic in one place.

3. **Async agent.** `run_agent()` is `async`. The FastAPI route `await`s it. AutoGen is async-first.

4. **Chat history via state loading.** The last 20 messages from `chat_messages` are converted into an AutoGen agent state dict and loaded via `load_state()` before each turn. Consecutive same-role messages are merged and trailing unanswered user messages are trimmed to maintain Anthropic's strict alternation requirement.

5. **Reuse existing extractors.** The WhatsApp parser and OCR client were built and tested before the agent existed. The agent tools call them directly rather than reimplementing.

6. **RLS disabled.** This is a personal single-user app. No auth layer. If it ever becomes multi-user, re-enable RLS and add Supabase Auth.

7. **Port 8001.** Port 8000 is occupied by another local service (Django). The frontend `api.ts` is hardcoded to `http://localhost:8001/api`.

## Coding Conventions

- Python: type hints everywhere, `from __future__ import annotations` at top of modules.
- No comments that just narrate what the code does. Comments only for non-obvious intent.
- Dataclasses for domain models, no Pydantic (keeping it lightweight).
- Frontend: functional components, no class components. Minimal dependencies (no state library, no CSS framework).

## Roadmap (Planned Sub-Agents / Tools)

### Phase 2: Quizlet Generator
- New tool: `generate_quizlet` -- given a topic or a date range, pull vocabulary from the DB and generate flashcard-style quiz questions.
- The agent should be able to call this when the user says things like "quiz me on this week's vocabulary" or "create flashcards for food words."
- Output: a structured quiz object (question + options + correct answer) that the frontend can render interactively.

### Phase 3: Data correction
- New tool: `correct_data` -- the agent should be able to correct the data in the database.
- If a word in **German** is not correct or spelled wrong, the agent should be able to correct it and make a note of the mistake.


### Phase 3: Topic Explainer
- New tool: `explain_topic` -- the user asks a German grammar question ("when do I use Dativ?") and the agent generates a clear explanation using examples from the user's own stored vocabulary/sentences.
- Should query the DB for relevant examples to ground the explanation in familiar material.

### Phase 4: Spaced Repetition
- Track which vocabulary the user gets right/wrong in quizzes.
- New table: `review_log` with columns for item ID, result, timestamp.
- Implement SM-2 or similar algorithm to schedule reviews.
- The agent proactively suggests "you have 12 words due for review today."

### Phase 5: Multi-User / Deployment
- Add Supabase Auth, re-enable RLS with user-scoped policies.
- Deploy backend to Fly.io or Railway, frontend to Vercel.
- Switch from hardcoded port to environment-based API URL.

## Progress Tracking

All progress, completed work, failed approaches, and session notes are tracked in `CHANGELOG.md`. Update it at the end of every work session.
