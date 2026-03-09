"""CLI entry point for the extractor module.

Usage:
    poetry run python -m german_notes.extractor.cli \\
        --input  data/"WhatsApp-Chat mit Maja.txt" \\
        --output output/
"""

import argparse
import csv
import sys
from pathlib import Path

from german_notes.core.models import GermanSentence, VocabPair
from german_notes.extractor.classifier import classify
from german_notes.extractor.parser import parse_file

_VOCAB_FIELDS = ["german", "translation", "translation_lang", "date", "sender", "raw_message"]
_SENTENCE_FIELDS = ["sentence", "date", "sender"]


def _write_vocab(pairs: list[VocabPair], dest: Path) -> None:
    with open(dest, "w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=_VOCAB_FIELDS)
        writer.writeheader()
        for pair in pairs:
            writer.writerow(
                {
                    "german": pair.german,
                    "translation": pair.translation,
                    "translation_lang": pair.translation_lang,
                    "date": pair.date,
                    "sender": pair.sender,
                    "raw_message": pair.raw_message,
                }
            )


def _write_sentences(sentences: list[GermanSentence], dest: Path) -> None:
    with open(dest, "w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=_SENTENCE_FIELDS)
        writer.writeheader()
        for sent in sentences:
            writer.writerow(
                {
                    "sentence": sent.sentence,
                    "date": sent.date,
                    "sender": sent.sender,
                }
            )


def run(input_path: Path, output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)

    vocab_pairs: list[VocabPair] = []
    german_sentences: list[GermanSentence] = []

    total = 0
    for message in parse_file(input_path):
        total += 1
        result = classify(message)
        if isinstance(result, VocabPair):
            vocab_pairs.append(result)
        elif isinstance(result, GermanSentence):
            german_sentences.append(result)

    vocab_path = output_dir / "vocabulary.csv"
    sentences_path = output_dir / "german_sentences.csv"

    _write_vocab(vocab_pairs, vocab_path)
    _write_sentences(german_sentences, sentences_path)

    print(f"Processed {total} messages.")
    print(f"  Vocabulary pairs : {len(vocab_pairs):>4}  → {vocab_path}")
    print(f"  German sentences : {len(german_sentences):>4}  → {sentences_path}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Extract German vocabulary pairs and sentences from a WhatsApp chat export."
    )
    parser.add_argument(
        "--input",
        required=True,
        type=Path,
        help="Path to the WhatsApp .txt export file.",
    )
    parser.add_argument(
        "--output",
        required=True,
        type=Path,
        help="Directory where vocabulary.csv and german_sentences.csv will be written.",
    )
    args = parser.parse_args()

    if not args.input.exists():
        print(f"Error: input file not found: {args.input}", file=sys.stderr)
        sys.exit(1)

    run(args.input, args.output)


if __name__ == "__main__":
    main()
