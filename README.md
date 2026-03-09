# German Notes Picker

Extracts German vocabulary pairs and full German sentences from a WhatsApp chat export. Built to be modular — the `extractor` module produces structured CSV data that future modules (e.g. a flashcard app) can consume.

## Project Structure

```
German_notes_picker/
├── .gitignore                  # excludes data/ — raw chat is never committed
├── pyproject.toml              # Poetry config
├── poetry.lock
├── README.md
├── data/                       # gitignored — place your WhatsApp export here
├── output/
│   ├── vocabulary.csv          # extracted vocab pairs (committed)
│   └── german_sentences.csv    # extracted German sentences (committed)
└── german_notes/               # main Python package
    ├── core/
    │   └── models.py           # shared dataclasses: Message, VocabPair, GermanSentence
    ├── extractor/
    │   ├── parser.py           # WhatsApp German-locale line parser
    │   ├── classifier.py       # vocab pair + sentence classifiers
    │   └── cli.py              # CLI entry point
    └── flashcards/             # future module (placeholder)
```

## Setup

Requires Python 3.11+ and [Poetry](https://python-poetry.org/).

```bash
poetry install
```

## Usage

1. Export your WhatsApp chat ("Without Media") and place the `.txt` file in the `data/` folder.
2. Run the extractor:

```bash
poetry run python -m german_notes.extractor.cli \
    --input  "data/WhatsApp-Chat mit Maja.txt" \
    --output output/
```

This writes two files:

| File | Contents |
|---|---|
| `output/vocabulary.csv` | German words paired with their Spanish or English translations |
| `output/german_sentences.csv` | Full sentences written in German, for grammar review |

### `vocabulary.csv` columns

| Column | Description |
|---|---|
| `german` | The German word or phrase |
| `translation` | The translation |
| `translation_lang` | Language of the translation (`es` or `en`) |
| `date` | Date the message was sent |
| `sender` | Name of the sender |
| `raw_message` | Original message text (useful for reviewing typos) |

### `german_sentences.csv` columns

| Column | Description |
|---|---|
| `sentence` | Full German sentence |
| `date` | Date the message was sent |
| `sender` | Name of the sender |

## How classification works

**Vocab pairs** are identified by a separator (`=` or `-`) between two short terms. `langdetect` determines which side is German and which is the translation. Either side can be German — the classifier normalises the output so `german` always holds the German term. Typos are preserved as-is.

**German sentences** are messages that:
- Do not match the vocab pair pattern
- Contain at least 4 words
- Are detected as German by `langdetect`

## WhatsApp export format

The parser handles the **German locale** format:

```
DD.MM.YY, H:MM abends - Sender: message text
```

## Planned modules

- `german_notes.flashcards` — interactive memory-card app to practice the extracted vocabulary
