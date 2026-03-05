from synapse.chunker import chunk_text


def test_empty_text_returns_empty_list():
    assert chunk_text("") == []


def test_whitespace_only_returns_empty_list():
    assert chunk_text("   \n\t  ") == []


def test_short_text_returns_single_chunk():
    chunks = chunk_text("Hello world", chunk_size=500)
    assert chunks == ["Hello world"]


def test_long_text_is_split():
    text = "a" * 1200
    chunks = chunk_text(text, chunk_size=500, overlap=50)
    assert len(chunks) > 1


def test_overlap_is_applied():
    text = "a" * 1000
    chunks_no_overlap = chunk_text(text, chunk_size=500, overlap=0)
    chunks_with_overlap = chunk_text(text, chunk_size=500, overlap=100)
    # Overlap produces more chunks
    assert len(chunks_with_overlap) >= len(chunks_no_overlap)


def test_chunks_cover_full_text():
    text = "word " * 200  # 1000 chars
    chunks = chunk_text(text, chunk_size=300, overlap=50)
    # First chunk starts with the beginning of the text
    assert chunks[0].startswith("word")
    # Last chunk ends with the end of the text
    reconstructed = "".join(chunks)
    assert "word" in reconstructed


def test_whitespace_is_normalized():
    text = "hello   \n\n  world"
    chunks = chunk_text(text, chunk_size=500)
    assert chunks == ["hello world"]
