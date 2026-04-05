"""Shared CSV writers for vocabulary pairs and German sentences."""

import csv
from pathlib import Path

from german_notes.core.models import GermanSentence, VocabPair

VOCAB_FIELDS = ["german", "translation", "translation_lang", "date", "sender", "raw_message"]
SENTENCE_FIELDS = ["sentence", "date", "sender"]


def write_vocab(pairs: list[VocabPair], dest: Path, *, append: bool = False) -> None:
    mode = "a" if append else "w"
    write_header = not append or not dest.exists() or dest.stat().st_size == 0

    with open(dest, mode, newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=VOCAB_FIELDS)
        if write_header:
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


def write_sentences(sentences: list[GermanSentence], dest: Path, *, append: bool = False) -> None:
    mode = "a" if append else "w"
    write_header = not append or not dest.exists() or dest.stat().st_size == 0

    with open(dest, mode, newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=SENTENCE_FIELDS)
        if write_header:
            writer.writeheader()
        for sent in sentences:
            writer.writerow(
                {
                    "sentence": sent.sentence,
                    "date": sent.date,
                    "sender": sent.sender,
                }
            )
