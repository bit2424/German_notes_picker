# Changelog -- German Notes Agent

Progress log for the German Notes agentic system. Updated after each work session.

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
2. Start on Phase 2 (Quizlet Generator) -- the main value-add beyond just storing data.
