"""CLI entry point for the OCR module.

Usage:
    poetry run python -m german_notes.ocr.cli \\
        --input  data/notebook_images/ \\
        --output output/
"""

import argparse
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

from german_notes.core.writers import write_sentences, write_vocab
from german_notes.ocr.client import collect_images, extract_from_image


def run(input_path: Path, output_dir: Path, *, append: bool = False) -> None:
    load_dotenv()
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        print(
            "Error: ANTHROPIC_API_KEY not set. "
            "Create a .env file with your key (see .env.example).",
            file=sys.stderr,
        )
        sys.exit(1)

    images = collect_images(input_path)
    if not images:
        print("No supported images found.", file=sys.stderr)
        sys.exit(1)

    output_dir.mkdir(parents=True, exist_ok=True)

    all_vocab = []
    all_sentences = []

    for i, image in enumerate(images, 1):
        print(f"[{i}/{len(images)}] Processing {image.name} …")
        try:
            vocab, sentences = extract_from_image(image, api_key=api_key)
            all_vocab.extend(vocab)
            all_sentences.extend(sentences)
            print(f"         → {len(vocab)} vocab pairs, {len(sentences)} sentences")
        except Exception as exc:
            print(f"         ✗ Failed: {exc}", file=sys.stderr)

    vocab_path = output_dir / "vocabulary.csv"
    sentences_path = output_dir / "german_sentences.csv"

    write_vocab(all_vocab, vocab_path, append=append)
    write_sentences(all_sentences, sentences_path, append=append)

    mode_label = "Appended to" if append else "Wrote"
    print(f"\nProcessed {len(images)} image(s).")
    print(f"  Vocabulary pairs : {len(all_vocab):>4}  — {mode_label} {vocab_path}")
    print(f"  German sentences : {len(all_sentences):>4}  — {mode_label} {sentences_path}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Extract German vocabulary and sentences from notebook images via OCR."
    )
    parser.add_argument(
        "--input",
        required=True,
        type=Path,
        help="Path to a single image or a directory of images.",
    )
    parser.add_argument(
        "--output",
        required=True,
        type=Path,
        help="Directory where vocabulary.csv and german_sentences.csv will be written.",
    )
    parser.add_argument(
        "--append",
        action="store_true",
        default=False,
        help="Append to existing CSVs instead of overwriting.",
    )
    args = parser.parse_args()

    if not args.input.exists():
        print(f"Error: input path not found: {args.input}", file=sys.stderr)
        sys.exit(1)

    run(args.input, args.output, append=args.append)


if __name__ == "__main__":
    main()
