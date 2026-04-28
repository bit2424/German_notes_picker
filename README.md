# German Notes Picker

A German-language learning assistant that extracts and stores vocabulary from multiple sources: WhatsApp chats, notebook photos, and direct messages. Powered by a Claude-based chat agent with a web UI.

## Project Structure

```
German_notes_picker/
├── pyproject.toml              # Poetry config (Python backend)
├── .env.example                # environment variable template
├── german_notes/               # Python backend
│   ├── core/
│   │   ├── models.py           # shared dataclasses: Message, VocabPair, GermanSentence
│   │   └── writers.py          # CSV writers (legacy CLI usage)
│   ├── extractor/
│   │   ├── parser.py           # WhatsApp German-locale line parser
│   │   ├── classifier.py       # vocab pair + sentence classifiers
│   │   └── cli.py              # CLI entry point (standalone)
│   ├── ocr/
│   │   ├── prompt.py           # vision model prompt templates
│   │   ├── client.py           # Anthropic Claude vision API wrapper
│   │   └── cli.py              # CLI entry point (standalone)
│   ├── api/
│   │   ├── main.py             # FastAPI app entry point
│   │   ├── routes.py           # REST endpoints (/api/chat, /api/vocabulary, etc.)
│   │   ├── agent.py            # Main Claude agent with tool-use loop
│   │   ├── tools.py            # Tool handlers (store, extract, parse)
│   │   └── supabase_client.py  # Supabase client singleton
│   └── flashcards/             # future module (placeholder)
└── frontend/                   # React + Vite chat UI
    └── src/
        ├── App.tsx             # main chat layout
        ├── api.ts              # backend API client
        └── components/
            ├── ChatMessage.tsx  # message bubble
            └── ChatInput.tsx   # input bar with file upload
```

## Setup

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (recommended)
- Python 3.11+ and [Poetry](https://python-poetry.org/) (for local-only development)
- Node 22+ and npm (for local-only development)

### 1. Environment variables

```bash
cp .env.example .env
```

Edit `.env` and fill in the three required keys:

| Variable | Where to get it |
|---|---|
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com/) |
| `SUPABASE_URL` | Supabase project Settings > API |
| `SUPABASE_KEY` | Supabase project Settings > API (anon / public key) |

### 2. Start with Docker (recommended)

```bash
make up          # builds and starts backend + frontend
make doctor      # verifies everything is healthy
```

Open http://localhost:5173 in your browser.

The backend runs on port **8001** (port 8000 is reserved for other local services). The frontend dev server runs on port **5173** and proxies `/api/*` requests to the backend container automatically.

### 3. Diagnostics

Run `make doctor` at any time to check the health of every layer:

```
=== Docker daemon ===
  PASS  Docker daemon is responsive

=== Port conflicts ===
  PASS  Port 8001 held by backend container
  PASS  Port 5173 held by frontend container

=== Environment (.env) ===
  PASS  .env file exists
  PASS  ANTHROPIC_API_KEY is set
  PASS  SUPABASE_URL is set
  PASS  SUPABASE_KEY is set

=== Containers ===
  PASS  backend: running (healthy)
  PASS  frontend: running

=== Backend health endpoint ===
  PASS  GET /api/health → 200
  PASS  Supabase connected
  PASS  Anthropic key present

=== Frontend proxy ===
  PASS  Frontend proxy → backend works
```

Fix any FAIL items, then re-run `make doctor` until everything passes.

### Alternative: run without Docker

```bash
# Terminal 1 — backend
poetry install --with dev
poetry run uvicorn german_notes.api.main:app --reload --port 8001

# Terminal 2 — frontend
cd frontend && npm install && npm run dev
```

### Pre-commit hooks (optional but recommended)

```bash
pipx install pre-commit  # or: brew install pre-commit
pre-commit install
```

Runs `ruff` (Python lint + format), `prettier`, and `eslint --fix` on staged files before each commit.

## Common commands

| Command | What it does |
|---|---|
| `make up` | Start both containers |
| `make down` | Stop both containers |
| `make restart` | Restart without rebuilding |
| `make rebuild` | Full clean rebuild (removes volumes) |
| `make logs` | Tail both container logs |
| `make logs-backend` | Tail backend logs only |
| `make doctor` | Run full diagnostic check |
| `make status` | Show container status |
| `make check` | Run all linters, formatters, and type checks |

## Quality checks

```bash
# Backend
poetry run ruff check .          # lint
poetry run ruff format .         # format
poetry run mypy german_notes     # type check
poetry run pytest                # tests

# Frontend
cd frontend
npm run lint           # ESLint
npm run format:check   # Prettier
npm run typecheck      # tsc --noEmit
npm run build          # Vite build (also runs tsc)
```

The same checks run in GitHub Actions CI on every push and pull request (`.github/workflows/ci.yml`).

## Troubleshooting

### "502 Bad Gateway" or "Failed to load resource"

The frontend can't reach the backend. Run `make doctor` to pinpoint the issue. Common causes:

1. **Backend container isn't running.** Check with `make status`, restart with `make up`.
2. **Backend crashed on startup.** Check `make logs-backend` for Python import errors — usually means a code change broke something. Run `make rebuild` after fixing.
3. **Port 8001 is stolen.** Another process (e.g., Django) grabbed port 8001 before the container started. Kill it or stop the container that's using it, then `make restart`.

### Docker commands hang indefinitely

Docker Desktop is either not running or stuck mid-startup.

1. Open Docker Desktop and wait for the engine to finish initializing.
2. Test with `docker info` — if it hangs, restart Docker Desktop.
3. On macOS: `killall Docker && open -a Docker` to force-restart.

### Frontend shows empty data / silent errors

The frontend silently catches fetch errors. If the Library view is empty:

1. Open browser DevTools > Network tab and check if `/api/words` returns 200.
2. Run `curl http://localhost:8001/api/health` to confirm the backend is alive.
3. Check that Supabase has data: `make doctor` reports whether the DB is connected.

### "localhost" vs Docker service names

Inside Docker containers, services talk to each other by **service name** (`backend`, `frontend`), not `localhost`. The `vite.config.ts` proxy uses the `API_URL` environment variable (set to `http://backend:8001` in `docker-compose.yml`) so this works automatically. If you override `API_URL`, use the Docker service name, not `localhost`.

### Container runs but backend shows "unhealthy"

The backend healthcheck hits `/api/health`. If it fails:

1. `make logs-backend` — look for startup errors (missing deps, import failures).
2. `make rebuild` — rebuilds the image from scratch, reinstalls dependencies.
3. Check `.env` — a missing `SUPABASE_URL` will make the health endpoint report `db_connected: false`.

## What you can send

| Input | What happens |
|---|---|
| A German word + translation (e.g. "Hund = dog") | Stored as vocabulary |
| A German sentence | Stored as a sentence for review |
| A photo of notebook notes | OCR extracts vocab + sentences, stores them |
| A WhatsApp `.txt` export | Parsed and classified into vocab + sentences |

All data is stored in Supabase (Postgres).

## Architecture

The backend uses a **Claude tool-use agent**. When you send a message, Claude decides which tools to call:

- `store_vocabulary` — save vocab pairs to the database
- `store_sentences` — save German sentences to the database
- `extract_from_image` — OCR a photo, then store extracted data
- `parse_whatsapp_export` — parse a WhatsApp `.txt` file, then store extracted data

Future sub-agents (quizlet generation, topic explanations) can be added as new tools.

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/chat` | Send a message (multipart form: `message` + `files`) |
| `GET` | `/api/chat/history` | Recent chat messages |
| `GET` | `/api/vocabulary` | Stored vocabulary pairs |
| `GET` | `/api/sentences` | Stored sentences |

## Legacy CLI Tools

The original CLI tools still work for batch processing:

```bash
# WhatsApp extraction
poetry run python -m german_notes.extractor.cli \
    --input "data/WhatsApp-Chat.txt" --output output/

# Notebook OCR
poetry run python -m german_notes.ocr.cli \
    --input data/notebook_images/ --output output/ --append
```
