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
  FastAPI backend
  |
  Main Agent (Claude tool-use loop, german_notes/api/agent.py)
  |--- store_vocabulary     -> Supabase `vocabulary` table
  |--- store_sentences      -> Supabase `sentences` table
  |--- extract_from_image   -> OCR via Claude Vision -> store results
  |--- parse_whatsapp_export-> regex parser + langdetect classifier -> store results
  |--- [FUTURE] generate_quizlet
  |--- [FUTURE] explain_topic
```

"Sub-agents" are implemented as **tools** the main agent can invoke. The agent loop in `agent.py` runs up to 5 rounds of tool calls before returning. Adding a new capability = adding a tool definition + a handler function.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Language | Python 3.11+, TypeScript |
| Package manager | Poetry (backend), npm (frontend) |
| Backend framework | FastAPI + Uvicorn |
| Frontend | React 19 + Vite + TypeScript |
| LLM | Anthropic Claude (claude-sonnet-4-20250514) via `anthropic` SDK |
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

## Code Map

### Backend (`german_notes/`)

| Module | Purpose |
|--------|---------|
| `core/models.py` | Shared dataclasses: `Message`, `VocabPair`, `GermanSentence` |
| `core/writers.py` | CSV writers (legacy CLI, still works) |
| `extractor/parser.py` | WhatsApp German-locale `.txt` parser (regex-based) |
| `extractor/classifier.py` | Heuristic classifier: vocab pair detection (separator + langdetect + German markers) and German sentence detection |
| `extractor/cli.py` | Standalone CLI for WhatsApp extraction |
| `ocr/prompt.py` | System/user prompts for Claude Vision OCR |
| `ocr/client.py` | Sends images to Claude Vision, parses structured JSON response |
| `ocr/cli.py` | Standalone CLI for notebook OCR |
| `api/main.py` | FastAPI app, CORS, lifespan (dotenv loading) |
| `api/routes.py` | REST endpoints: `POST /api/chat`, `GET /api/chat/history`, `GET /api/vocabulary`, `GET /api/sentences` |
| `api/agent.py` | Main agent: system prompt, tool definitions, Claude tool-use loop (max 5 rounds) |
| `api/tools.py` | Tool handlers: `store_vocabulary`, `store_sentences`, `extract_from_image`, `parse_whatsapp_export` |
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

1. **Tools, not sub-processes.** Sub-agents are Claude tool definitions, not separate LLM calls. This keeps latency low and the architecture simple. A future "quizlet agent" that needs its own LLM reasoning can be implemented as a tool that internally makes its own Claude call.

2. **Synchronous agent loop.** The `run_agent()` function blocks until done (up to 5 tool rounds). This is fine for a single-user personal app. If latency becomes a problem, switch to streaming (SSE).

3. **Flat chat history.** The last 20 messages are loaded from `chat_messages` and sent as context to Claude on every turn. No summarisation yet. If context grows too large, add a summarisation step.

4. **Reuse existing extractors.** The WhatsApp parser and OCR client were built and tested before the agent existed. The agent tools call them directly rather than reimplementing.

5. **RLS disabled.** This is a personal single-user app. No auth layer. If it ever becomes multi-user, re-enable RLS and add Supabase Auth.

6. **Port 8001.** Port 8000 is occupied by another local service (Django). The frontend `api.ts` is hardcoded to `http://localhost:8001/api`.

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
