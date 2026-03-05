import csv
import tempfile
from pathlib import Path

import pytest

from synapse.extractors import extract, is_supported


# --- helpers ---

def write_temp(suffix: str, content: str) -> Path:
    f = tempfile.NamedTemporaryFile(suffix=suffix, delete=False, mode="w", encoding="utf-8")
    f.write(content)
    f.close()
    return Path(f.name)


# --- txt / md ---

def test_extract_txt():
    path = write_temp(".txt", "Hello from txt")
    assert extract(path) == "Hello from txt"


def test_extract_md():
    path = write_temp(".md", "# Title\nSome content")
    assert "Title" in extract(path)


# --- csv ---

def test_extract_csv():
    path = write_temp(".csv", "name,age\nAlice,30\nBob,25")
    result = extract(path)
    assert "Alice" in result
    assert "Bob" in result


# --- pdf ---

def test_extract_pdf():
    pypdf = pytest.importorskip("pypdf")
    from pypdf import PdfWriter
    import io

    writer = PdfWriter()
    writer.add_blank_page(width=200, height=200)
    buf = io.BytesIO()
    writer.write(buf)

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
        f.write(buf.getvalue())
        path = Path(f.name)

    # Blank page extracts to empty string — just verify no exception
    result = extract(path)
    assert isinstance(result, str)


# --- docx ---

def test_extract_docx():
    pytest.importorskip("docx")
    from docx import Document
    import tempfile

    doc = Document()
    doc.add_paragraph("Hello from docx")
    with tempfile.NamedTemporaryFile(suffix=".docx", delete=False) as f:
        doc.save(f.name)
        path = Path(f.name)

    assert "Hello from docx" in extract(path)


# --- unsupported ---

def test_unsupported_extension_raises():
    path = write_temp(".xyz", "data")
    with pytest.raises(ValueError, match="Unsupported"):
        extract(path)


def test_is_supported():
    assert is_supported(Path("file.txt"))
    assert is_supported(Path("file.PDF"))  # case-insensitive
    assert not is_supported(Path("file.mp3"))
