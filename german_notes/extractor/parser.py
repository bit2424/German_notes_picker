"""Parse a WhatsApp .txt export (German locale) into Message objects.

German locale format:
    DD.MM.YY, H:MM <time_word> - Sender: message text

Where <time_word> is one of:
    morgens, vorm., mittags, nachm., abends, abends, nachts, Mitternacht
"""

import re
from pathlib import Path
from typing import Iterator

from german_notes.core.models import Message

_LINE_RE = re.compile(
    r"^(\d{2}\.\d{2}\.\d{2}),\s+"  # date: DD.MM.YY
    r"\d+:\d+\s+"                   # time: H:MM or HH:MM
    r"\S+\s+-\s+"                   # time-of-day word + separator " - "
    r"([^:]+):\s+"                  # sender name (everything before the first colon)
    r"(.+)$"                        # message text
)

_SKIP_PATTERNS = (
    re.compile(r"<Medien ausgeschlossen>"),
    re.compile(r"<Diese Nachricht wurde .+>"),
    re.compile(r"^https?://"),
    re.compile(r"Nachrichten und Anrufe sind Ende-zu-Ende-verschlüsselt"),
    re.compile(r"^Standort: https?://"),
)


def _should_skip(text: str) -> bool:
    stripped = text.strip()
    return any(p.search(stripped) for p in _SKIP_PATTERNS)


def parse_file(path: Path) -> Iterator[Message]:
    """Yield one Message per valid chat line from *path*."""
    with open(path, encoding="utf-8") as fh:
        for raw_line in fh:
            line = raw_line.strip()
            if not line:
                continue
            match = _LINE_RE.match(line)
            if not match:
                continue
            date, sender, text = match.group(1), match.group(2).strip(), match.group(3).strip()
            if _should_skip(text):
                continue
            yield Message(date=date, sender=sender, text=text)
