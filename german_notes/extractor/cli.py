"""CLI entry point for the extractor module.

Usage:
    poetry run python -m german_notes.extractor.cli \\
        --input  data/"WhatsApp-Chat mit Maja.txt" \\
        --output output/
"""

import argparse
import sys
from pathlib import Path

from german_notes.core.models import GermanSentence, VocabPair
from german_notes.core.writers import write_sentences, write_vocab
from german_notes.extractor.classifier import classify
from german_notes.extractor.parser import parse_file


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

    write_vocab(vocab_pairs, vocab_path)
    write_sentences(german_sentences, sentences_path)

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
