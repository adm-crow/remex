import pytest

from remex.core.chunker import chunk_text


@pytest.fixture
def require_nltk():
    """Skip the test if nltk is not installed (sentence mode only)."""
    pytest.importorskip("nltk")


def test_empty_text_returns_empty_list():
    assert chunk_text("") == []


def test_whitespace_only_returns_empty_list():
    assert chunk_text("   \n\t  ") == []


def test_short_text_returns_single_chunk():
    chunks = chunk_text("Hello world", chunk_size=500, min_chunk_size=1)
    assert chunks == ["Hello world"]


def test_long_text_is_split():
    text = "a" * 1200
    chunks = chunk_text(text, chunk_size=500, overlap=50)
    assert len(chunks) > 1


def test_overlap_is_applied():
    text = "a" * 1000
    chunks_no_overlap = chunk_text(text, chunk_size=500, overlap=0)
    chunks_with_overlap = chunk_text(text, chunk_size=500, overlap=100)
    assert len(chunks_with_overlap) >= len(chunks_no_overlap)


def test_chunks_cover_full_text():
    text = "word " * 200
    chunks = chunk_text(text, chunk_size=300, overlap=50)
    assert chunks[0].startswith("word")
    assert "word" in "".join(chunks)


def test_whitespace_is_normalized():
    text = "hello   \n\n  world"
    chunks = chunk_text(text, chunk_size=500, min_chunk_size=1)
    assert chunks == ["hello world"]


def test_word_boundary_respected():
    # Chunks should not end mid-word
    text = "hello world " * 50  # 600 chars of alternating words
    chunks = chunk_text(text, chunk_size=100, overlap=20)
    for chunk in chunks[:-1]:  # last chunk naturally ends at text boundary
        last_word = chunk.split()[-1] if chunk.split() else ""
        assert last_word in ("hello", "world"), (
            f"Chunk ends with partial word: '{last_word}'"
        )


def test_overlap_gte_chunk_size_raises():
    with pytest.raises(ValueError, match="overlap"):
        chunk_text("some text", chunk_size=100, overlap=100)


def test_min_chunk_size_filters_tiny_chunks():
    # Produce a tiny trailing chunk (1 char) that should be filtered out
    text = "a" * 100 + " b"  # after normalization: 102 chars, last chunk = "b"
    chunks = chunk_text(text, chunk_size=100, overlap=0, min_chunk_size=10)
    for chunk in chunks:
        assert len(chunk) >= 10


def test_invalid_mode_raises():
    with pytest.raises(ValueError, match="mode"):
        chunk_text("some text", mode="invalid")


# --- sentence mode ---

def test_sentence_mode_returns_chunks(require_nltk):
    text = "The sky is blue. The grass is green. The sun is bright."
    chunks = chunk_text(text, chunk_size=500, min_chunk_size=1, mode="sentence")
    assert isinstance(chunks, list)
    assert len(chunks) >= 1


def test_sentence_mode_short_text_single_chunk(require_nltk):
    text = "Hello world. This is a test."
    chunks = chunk_text(text, chunk_size=500, min_chunk_size=1, mode="sentence")
    assert len(chunks) == 1


def test_sentence_mode_splits_on_boundaries(require_nltk):
    # 3 sentences of ~40 chars each; chunk_size=60 → should produce 2 chunks
    text = "The cat sat on the mat. The dog ran away fast. The bird flew high up."
    chunks = chunk_text(text, chunk_size=60, overlap=0, min_chunk_size=1, mode="sentence")
    assert len(chunks) >= 2
    # No chunk should cut a sentence mid-way
    for chunk in chunks:
        assert not chunk.endswith("The") and not chunk.endswith("a")


def test_sentence_mode_respects_min_chunk_size(require_nltk):
    text = "Hi. Hello world, this is a longer sentence that should survive."
    chunks = chunk_text(text, chunk_size=500, min_chunk_size=10, mode="sentence")
    for chunk in chunks:
        assert len(chunk) >= 10


def test_sentence_mode_empty_text(require_nltk):
    assert chunk_text("", mode="sentence") == []


def test_sentence_mode_paragraph_split(require_nltk):
    text = "First paragraph sentence one. First paragraph sentence two.\n\nSecond paragraph sentence one."
    chunks = chunk_text(text, chunk_size=500, min_chunk_size=1, mode="sentence")
    assert len(chunks) >= 1
    full = " ".join(chunks)
    assert "First paragraph" in full
    assert "Second paragraph" in full


def test_sentence_mode_long_sentence_fallback(require_nltk):
    # A single sentence longer than chunk_size should fall back to word chunking
    long_sent = "word " * 300  # ~1500 chars, one "sentence"
    chunks = chunk_text(long_sent, chunk_size=500, overlap=50, min_chunk_size=1, mode="sentence")
    assert len(chunks) > 1


# --- recursive mode ---

def test_recursive_mode_short_text_single_chunk():
    text = "Hello world. This is a test."
    chunks = chunk_text(text, chunk_size=500, min_chunk_size=1, mode="recursive")
    assert len(chunks) == 1
    assert "Hello world" in chunks[0]


def test_recursive_mode_splits_on_paragraphs():
    para1 = "First paragraph. " * 5   # ~85 chars
    para2 = "Second paragraph. " * 5  # ~90 chars
    text = para1.strip() + "\n\n" + para2.strip()
    # chunk_size=80 forces a split between paragraphs
    chunks = chunk_text(text, chunk_size=80, overlap=0, min_chunk_size=1, mode="recursive")
    assert len(chunks) >= 2
    full = " ".join(chunks)
    assert "First paragraph" in full
    assert "Second paragraph" in full


def test_recursive_mode_falls_back_to_line_then_word():
    # No paragraph breaks — should split on lines, then words
    text = ("alpha beta gamma delta " * 10 + "\n") * 3
    chunks = chunk_text(text, chunk_size=100, overlap=20, min_chunk_size=1, mode="recursive")
    assert len(chunks) > 1
    assert all(len(c) <= 120 for c in chunks)  # reasonable headroom


def test_recursive_mode_overlap_increases_chunk_count():
    text = "word " * 300
    no_overlap  = chunk_text(text, chunk_size=200, overlap=0,  min_chunk_size=1, mode="recursive")
    with_overlap = chunk_text(text, chunk_size=200, overlap=50, min_chunk_size=1, mode="recursive")
    assert len(with_overlap) >= len(no_overlap)


def test_recursive_mode_empty_text():
    assert chunk_text("", mode="recursive") == []


def test_recursive_mode_is_default():
    # Calling chunk_text with no mode argument should use recursive
    text = "Paragraph one.\n\nParagraph two."
    chunks_default   = chunk_text(text, chunk_size=500, min_chunk_size=1)
    chunks_recursive = chunk_text(text, chunk_size=500, min_chunk_size=1, mode="recursive")
    assert chunks_default == chunks_recursive


def test_recursive_mode_long_piece_falls_back_to_word():
    # A single run of text with no separators exceeding chunk_size falls back to words
    text = "word " * 400  # ~2000 chars, no \n\n or \n or ". "
    chunks = chunk_text(text, chunk_size=300, overlap=50, min_chunk_size=1, mode="recursive")
    assert len(chunks) > 1
    assert all("word" in c for c in chunks)
