"""Unit tests for the WhatsApp German-locale .txt parser."""

from __future__ import annotations

from pathlib import Path

import pytest

from german_notes.extractor.parser import parse_file


def _write(tmp_path: Path, content: str) -> Path:
    path = tmp_path / "chat.txt"
    path.write_text(content, encoding="utf-8")
    return path


def test_parses_basic_line(tmp_path: Path) -> None:
    path = _write(tmp_path, "01.03.24, 10:30 vorm. - Nelson: Mädchen = girl\n")
    messages = list(parse_file(path))

    assert len(messages) == 1
    msg = messages[0]
    assert msg.date == "01.03.24"
    assert msg.sender == "Nelson"
    assert msg.text == "Mädchen = girl"


def test_parses_multiple_lines_with_different_senders(tmp_path: Path) -> None:
    content = (
        "01.03.24, 9:15 vorm. - Nelson: Hallo\n"
        "01.03.24, 9:16 vorm. - Anna: Guten Morgen\n"
        "02.03.24, 8:00 vorm. - Nelson: Tür = door\n"
    )
    messages = list(parse_file(_write(tmp_path, content)))

    assert [m.sender for m in messages] == ["Nelson", "Anna", "Nelson"]
    assert [m.date for m in messages] == ["01.03.24", "01.03.24", "02.03.24"]
    assert messages[2].text == "Tür = door"


def test_skips_blank_lines(tmp_path: Path) -> None:
    content = (
        "\n"
        "01.03.24, 10:30 vorm. - Nelson: Hallo\n"
        "   \n"
        "01.03.24, 10:31 vorm. - Nelson: Welt\n"
    )
    messages = list(parse_file(_write(tmp_path, content)))

    assert len(messages) == 2
    assert messages[0].text == "Hallo"
    assert messages[1].text == "Welt"


def test_skips_lines_not_matching_format(tmp_path: Path) -> None:
    # Continuation lines (no date prefix) should be ignored.
    content = (
        "01.03.24, 10:30 vorm. - Nelson: Hallo\n"
        "this line has no date\n"
        "01.03.24, 10:31 vorm. - Nelson: zweite\n"
    )
    messages = list(parse_file(_write(tmp_path, content)))

    assert len(messages) == 2
    assert [m.text for m in messages] == ["Hallo", "zweite"]


def test_skips_excluded_media_messages(tmp_path: Path) -> None:
    content = (
        "01.03.24, 10:30 vorm. - Nelson: <Medien ausgeschlossen>\n"
        "01.03.24, 10:31 vorm. - Nelson: keep me\n"
    )
    messages = list(parse_file(_write(tmp_path, content)))

    assert [m.text for m in messages] == ["keep me"]


def test_skips_deleted_messages(tmp_path: Path) -> None:
    content = (
        "01.03.24, 10:30 vorm. - Nelson: <Diese Nachricht wurde gelöscht>\n"
        "01.03.24, 10:31 vorm. - Nelson: keep me\n"
    )
    messages = list(parse_file(_write(tmp_path, content)))

    assert [m.text for m in messages] == ["keep me"]


def test_skips_url_only_messages(tmp_path: Path) -> None:
    content = (
        "01.03.24, 10:30 vorm. - Nelson: https://example.com/page\n"
        "01.03.24, 10:31 vorm. - Nelson: keep me\n"
    )
    messages = list(parse_file(_write(tmp_path, content)))

    assert [m.text for m in messages] == ["keep me"]


def test_skips_encryption_notice(tmp_path: Path) -> None:
    content = (
        "01.03.24, 10:30 vorm. - System: "
        "Nachrichten und Anrufe sind Ende-zu-Ende-verschlüsselt.\n"
        "01.03.24, 10:31 vorm. - Nelson: keep me\n"
    )
    messages = list(parse_file(_write(tmp_path, content)))

    assert [m.text for m in messages] == ["keep me"]


def test_skips_location_messages(tmp_path: Path) -> None:
    content = (
        "01.03.24, 10:30 vorm. - Nelson: Standort: https://maps.example.com/loc\n"
        "01.03.24, 10:31 vorm. - Nelson: keep me\n"
    )
    messages = list(parse_file(_write(tmp_path, content)))

    assert [m.text for m in messages] == ["keep me"]


def test_handles_various_time_of_day_words(tmp_path: Path) -> None:
    # German locale uses morgens, vorm., mittags, nachm., abends, nachts.
    content = (
        "01.03.24, 7:00 morgens - Nelson: a\n"
        "01.03.24, 12:00 mittags - Nelson: b\n"
        "01.03.24, 3:00 nachm. - Nelson: c\n"
        "01.03.24, 9:00 abends - Nelson: d\n"
        "01.03.24, 1:00 nachts - Nelson: e\n"
    )
    messages = list(parse_file(_write(tmp_path, content)))

    assert [m.text for m in messages] == ["a", "b", "c", "d", "e"]


def test_returns_empty_iterator_for_empty_file(tmp_path: Path) -> None:
    assert list(parse_file(_write(tmp_path, ""))) == []


def test_parse_file_returns_iterator_not_list(tmp_path: Path) -> None:
    path = _write(tmp_path, "01.03.24, 10:30 vorm. - Nelson: hi\n")
    result = parse_file(path)

    # parse_file is a generator — confirm it's lazy.
    assert iter(result) is result  # generators are their own iterator


def test_missing_file_raises(tmp_path: Path) -> None:
    with pytest.raises(FileNotFoundError):
        list(parse_file(tmp_path / "does_not_exist.txt"))
