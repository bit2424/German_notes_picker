from dataclasses import dataclass, field
from typing import Literal


@dataclass
class Message:
    """A single parsed WhatsApp message."""

    date: str
    sender: str
    text: str


@dataclass
class VocabPair:
    """A German word paired with its translation in Spanish or English.

    Either side of the original message may have been the German term;
    this dataclass always stores it normalised so `german` is the German word.
    Typos in either field are preserved as-is for manual review.
    """

    german: str
    translation: str
    translation_lang: Literal["de", "es", "en", "unknown"]
    date: str
    sender: str
    raw_message: str


@dataclass
class GermanSentence:
    """A complete sentence written in German, captured for grammar review."""

    sentence: str
    date: str
    sender: str
