# Changelog -- German Notes Agent

Progress log for the German Notes agentic system. Updated after each work session.

---

## 2026-04-07 -- Schema redesign: words, texts, translations, explanations, tags, corrections

### What was done

**Database schema redesign (6 Supabase migrations)**
- Replaced `vocabulary` and `sentences` tables with a richer relational schema:
  - `words` -- German words with `word_type` discriminator (verb/noun/adjective/other).
  - `verb_details`, `noun_details`, `adjective_declensions` -- type-specific grammar tables (1:1 or 1:N to words).
  - `translations` -- separate table for word translations (1:N, supports multiple languages).
  - `texts` -- replaces `sentences`, more general (sentence/phrase/paragraph).
  - `text_words` -- M:N junction linking words to texts (with position).
  - `explanations` -- polymorphic table (entity_type + entity_id) for attaching explanations to any entity.
  - `tags` + junction tables (`word_tags`, `text_tags`, `explanation_tags`) for categorization.
  - `corrections` -- tracks original vs. corrected German text with status workflow (pending/accepted/rejected).
- All tables follow new conventions: `uuid` PK, `created_at`/`updated_at`/`deleted_at` timestamps, soft deletes, FK indexes.
- Created shared `update_updated_at()` trigger function reused across all tables.
- Added `updated_at`/`deleted_at` to `chat_messages` for consistency.
- Disabled RLS on all new tables (personal single-user app).
- Migrated existing data: 11 vocabulary rows → words + translations, 2 sentences → texts.
- Dropped old `vocabulary` and `sentences` tables.

**Backend updates**
- `agents/tools.py` -- storage functions now insert into `words` + `translations` (two-step) and `texts`. Renamed `store_vocabulary` → `store_words`, `store_sentences` → `store_texts`.
- `agents/orchestrator.py` -- updated imports and system prompt for new tool names.
- `api/routes.py` -- new endpoints: `GET/PATCH/DELETE /api/words` (with nested translations via Supabase join), `POST /api/words/{id}/translations`, `PATCH/DELETE /api/translations/{id}`, `GET/PATCH/DELETE /api/texts`. All deletes are now soft deletes. All queries filter `deleted_at IS NULL`.

**Frontend updates**
- `api.ts` -- new TypeScript interfaces (`WordItem`, `TextItem`, `Translation`) and API functions matching new endpoints.
- Renamed `VocabularyTable.tsx` → `WordsTable.tsx`, `SentencesTable.tsx` → `TextsTable.tsx`.
- `WordsTable` displays nested translations from the joined response and supports editing both word and translation in one flow.
- `LibraryView` tabs renamed from "Vocabulary"/"Sentences" to "Words"/"Texts".

**Documentation**
- `CLAUDE.md` -- added "Database Conventions" section (UUID PKs, timestamps, soft deletes, FK indexing, naming, migration discipline, new-table template). Updated schema documentation to reflect all 14 tables.

### SQL migrations applied (in order)
1. `create_trigger_function_and_core_tables` -- trigger fn, words, texts
2. `create_word_detail_tables` -- verb_details, noun_details, adjective_declensions
3. `create_translations_and_text_words` -- translations, text_words
4. `create_explanations_tags_corrections` -- explanations, tags, junction tables, corrections
5. `update_chat_messages_drop_legacy_tables` -- add lifecycle columns to chat_messages, drop old tables
6. `disable_rls_on_new_tables` -- disable RLS on all 13 new tables

---

## 2026-04-06 -- Migrated agent to AutoGen + unified classification pipeline

### What was done

**Agent framework migration**
- Replaced the hand-rolled Claude tool-use loop (`api/agent.py`) with Microsoft AutoGen.
- New `german_notes/agents/` package:
  - `config.py` -- factory for `AnthropicChatCompletionClient` (Claude claude-sonnet-4-20250514).
  - `tools.py` -- async tool functions compatible with AutoGen's `AssistantAgent`, plus a shared `classify_and_store()` pipeline that both OCR and WhatsApp tools feed into.
  - `orchestrator.py` -- wires up the `AssistantAgent` with tools, loads prior chat history via `load_state()`, handles multimodal messages (images via `MultiModalMessage`), and returns the assistant's text reply.
- Added `autogen-agentchat`, `autogen-ext[anthropic]`, and `tiktoken` to `pyproject.toml`.
- `api/routes.py` now imports from `agents.orchestrator` and `await`s the async `run_agent()`.
- Deleted the old `api/agent.py`.

**Unified classification pipeline**
- OCR module refactored: `ocr/prompt.py` now asks Claude Vision to extract raw text lines only (returns `{"lines": [...]}`). `ocr/client.py` returns `list[str]` instead of classified objects.
- All classification (vocab pair vs. sentence) now goes through `extractor/classifier.py` as the single source of truth, regardless of whether the source is OCR or WhatsApp.
- `ocr/cli.py` updated to run OCR lines through the classifier before writing CSV.

**Chat history handling**
- History from Supabase is converted to AutoGen agent state format and injected via `load_state()`.
- Consecutive same-role messages are merged, empty messages are skipped, and trailing unanswered user messages are trimmed to satisfy Anthropic's strict alternation requirement.

### Verified working

- Simple chat (German questions answered without tools).
- Vocabulary storage via `store_vocabulary` tool (confirmed in Supabase).
- Sentence storage via `store_sentences` tool.
- Chat history context (agent recalls prior conversation).

### Architecture note

The `agents/` package is structured for future evolution to a Swarm: each tool group (OCR, extractor, flashcards) can become its own `AssistantAgent` with `handoffs`, orchestrated by a planner agent.

---

## 2026-04-05 -- Initial agent system built

### What was done

**Database (Supabase)**
- Created Supabase project "German Second brain" (ref: `xbxaujxiltreasmmgewi`, region: eu-west-1).
- Applied migration `create_initial_tables`: three tables (`vocabulary`, `sentences`, `chat_messages`) with UUID PKs, timestamps, and descending indexes on `created_at`.
- Applied migration `disable_rls_for_personal_use`: RLS disabled on all three tables since this is a single-user personal app.

**Backend (FastAPI + Claude agent)**
- Created `german_notes/api/` package with 5 modules:
  - `supabase_client.py` -- singleton Supabase client via `lru_cache`.
  - `tools.py` -- 4 tool handlers: `store_vocabulary`, `store_sentences`, `extract_from_image`, `parse_whatsapp_export`. The latter two reuse the existing `ocr/client.py` and `extractor/parser.py` + `classifier.py`.
  - `agent.py` -- main agent with system prompt, 4 tool definitions, and a tool-use loop (max 5 rounds). Uses `claude-sonnet-4-20250514`.
  - `routes.py` -- 4 endpoints: `POST /api/chat`, `GET /api/chat/history`, `GET /api/vocabulary`, `GET /api/sentences`.
  - `main.py` -- FastAPI app with CORS (`allow_origins=["*"]`) and dotenv loading in lifespan.
- Added dependencies to `pyproject.toml`: `fastapi`, `uvicorn[standard]`, `python-multipart`, `supabase`.
- Ran `poetry lock && poetry install` -- 47 new packages installed.

**Frontend (React + Vite)**
- Scaffolded with `npm create vite@latest frontend -- --template react-ts`.
- Built chat UI: `App.tsx` (message state, history fetch, send handler), `ChatInput.tsx` (text input + file upload with previews), `ChatMessage.tsx` (user/assistant bubbles).
- Styled with CSS variables, supports dark/light mode via `prefers-color-scheme`.
- API client (`api.ts`) hardcoded to `http://localhost:8001/api`.

**Config & docs**
- Updated `.env.example` with `SUPABASE_URL` and `SUPABASE_KEY`.
- Updated `.gitignore` with `node_modules/` and `frontend/dist/`.
- Rewrote `README.md` to document the new agent architecture, setup, and usage.

### Verified working

- Backend starts on port 8001 (`poetry run uvicorn german_notes.api.main:app --reload --port 8001`).
- `GET /api/vocabulary` returns `{"vocabulary": []}` -- Supabase connection confirmed.
- `GET /api/chat/history` returns stored messages -- insert + query pipeline confirmed.
- `POST /api/chat` stores user message in `chat_messages`, then calls the agent. With a valid API key, the full tool-use loop executes.
- Frontend renders on port 5174 (5173 was occupied) with header, empty state, input bar, and file upload button.
- CORS headers present (`access-control-allow-origin: *`).

### Issues encountered

- **Port 8000 conflict.** Another service (Django) occupies port 8000 on the local machine. Switched to port 8001. The frontend `api.ts` was updated to match. If port 8001 is also occupied in future, check with `lsof -i :8001`.
- **RLS blocking inserts.** Initial attempt to insert into `chat_messages` with the anon key failed: `new row violates row-level security policy`. Fixed by disabling RLS on all three tables. If multi-user is ever needed, re-enable RLS with proper policies.
- **Supabase MCP parameter naming.** The `get_project` MCP tool uses `id` not `project_id` as the parameter name. The `apply_migration` tool uses `project_id`. Inconsistent naming -- always check the tool schema JSON before calling.

### Known limitations

- **No streaming.** The agent blocks until all tool rounds complete. For large WhatsApp exports or multiple images, this can take 10-30 seconds with no progress feedback.
- **Chat history context window.** Last 20 messages are sent as context. No summarisation. With heavy use, this will hit token limits.
- **No error recovery in UI.** If the agent call fails, the frontend shows a generic error message. No retry button.
- **Single model.** Both the main agent and OCR use `claude-sonnet-4-20250514`. The OCR could use a cheaper model since it's a structured extraction task.
- **No tests.** Zero test coverage. The extractor and classifier were manually tested with real WhatsApp data, but there are no automated tests.

### What's next

See Roadmap in `CLAUDE.md`. Immediate priorities:
1. End-to-end test with a real vocab message, photo, and WhatsApp file to confirm the full pipeline.

2. we need to create an agent to sanitize the words and sentences before storing them in the database or even if they are already stored, the agent should be able to sanitize them.

2. Have an enricher for single words, the idea is that when single german words are detected or sent, the agent should be able to enrich the word with a translation, and other relevante information.

If it is a noun, the gender, the plural, a sentence.
If it is a verb, the tense, the conjugation, a sentence.
If it is an adjective, how is it declined in different cases and genders?
So on for other type of words.


3. Have a view to visualize and edit the vocabulary and sentences stored in the database.

4. Start on the Quizlet Generator tool (Quizlet Generator) -- the main value-add beyond just storing data.

5. Add GitHub agentic workflows to automate the creation of documentation.
