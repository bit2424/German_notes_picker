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

Requires Python 3.11+ and [Poetry](https://python-poetry.org/).

### Backend

```bash
poetry install
cp .env.example .env
# Edit .env and set:
#   ANTHROPIC_API_KEY=sk-ant-...
#   SUPABASE_URL=https://your-project.supabase.co
#   SUPABASE_KEY=your-anon-key
```

### Frontend

```bash
cd frontend
npm install
```

## Running

Start the backend and frontend in separate terminals:

```bash
# Terminal 1 — API server (port 8001 to avoid conflicts)
poetry run uvicorn german_notes.api.main:app --reload --port 8001

# Terminal 2 — Frontend dev server
cd frontend
npm run dev
```

Then open http://localhost:5173 (or the port Vite shows) in your browser.

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
