import re
from typing import List


# Separator hierarchy for recursive mode: try the highest-level boundary
# first and fall back to finer splits only when a piece still exceeds chunk_size.
_SEPARATORS = ["\n\n", "\n", ". ", " "]


def chunk_text(
    text: str,
    chunk_size: int = 768,
    overlap: int = 150,
    min_chunk_size: int = 50,
    mode: str = "recursive",
) -> List[str]:
    """Split text into overlapping chunks.

    Args:
        text:           Input text to split.
        chunk_size:     Target character count per chunk.
        overlap:        Character overlap between consecutive chunks.
        min_chunk_size: Chunks shorter than this are discarded.
        mode:           Chunking strategy:
                          "recursive" (default) — splits on paragraph breaks,
                            then line breaks, then sentence ends, then words.
                            Best retrieval precision for mixed content.
                          "sentence" — sentence/paragraph boundaries via nltk
                            (requires: pip install nltk).
                          "word" — snaps to word boundaries (legacy).
    """
    if overlap >= chunk_size:
        raise ValueError(f"overlap ({overlap}) must be less than chunk_size ({chunk_size})")
    if mode not in ("word", "sentence", "recursive"):
        raise ValueError(f"mode must be 'word', 'sentence', or 'recursive', got '{mode}'")

    if mode == "sentence":
        return _chunk_by_sentences(text, chunk_size, overlap, min_chunk_size)
    if mode == "recursive":
        return _chunk_recursive(text, chunk_size, overlap, min_chunk_size)

    # --- word mode ---
    return _chunk_by_words(text, chunk_size, overlap, min_chunk_size)


# ---------------------------------------------------------------------------
# Word mode
# ---------------------------------------------------------------------------

def _chunk_by_words(
    text: str,
    chunk_size: int,
    overlap: int,
    min_chunk_size: int,
) -> List[str]:
    text = " ".join(text.split())
    if not text:
        return []

    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        if end < len(text):
            boundary = text.rfind(" ", start, end)
            if boundary > start:
                end = boundary
        chunk = text[start:end].strip()
        if len(chunk) >= min_chunk_size:
            chunks.append(chunk)
        advance = end - start - overlap
        if advance <= 0:
            advance = max(1, chunk_size - overlap)
        start += advance

    return chunks


# ---------------------------------------------------------------------------
# Recursive separator mode
# ---------------------------------------------------------------------------

def _split_text(text: str, separators: List[str], chunk_size: int) -> List[str]:
    """Recursively split text until every piece fits within chunk_size."""
    if not text.strip():
        return []
    if not separators:
        return [text.strip()]

    sep, rest = separators[0], separators[1:]

    if sep not in text:
        return _split_text(text, rest, chunk_size)

    pieces = [p.strip() for p in text.split(sep) if p.strip()]
    result: List[str] = []
    for piece in pieces:
        if len(piece) <= chunk_size:
            result.append(piece)
        elif rest:
            result.extend(_split_text(piece, rest, chunk_size))
        else:
            result.append(piece)  # cannot split further; caller may fall back
    return result


def _merge_splits(
    pieces: List[str],
    chunk_size: int,
    overlap: int,
    min_chunk_size: int,
) -> List[str]:
    """Merge small pieces into fixed-size chunks with character-level overlap."""
    chunks: List[str] = []
    current: List[str] = []
    current_len = 0

    for piece in pieces:
        piece_len = len(piece)
        sep = 1 if current else 0  # one space separator between pieces

        if current and current_len + sep + piece_len > chunk_size:
            chunk = " ".join(current)
            if len(chunk) >= min_chunk_size:
                chunks.append(chunk)

            # Carry the tail of the current chunk for overlap continuity
            tail: List[str] = []
            tail_len = 0
            for p in reversed(current):
                cost = len(p) + (1 if tail else 0)
                if tail_len + cost <= overlap:
                    tail.insert(0, p)
                    tail_len += cost
                else:
                    break
            current = tail
            current_len = tail_len

        current.append(piece)
        current_len += (1 if len(current) > 1 else 0) + piece_len

    if current:
        chunk = " ".join(current)
        if len(chunk) >= min_chunk_size:
            chunks.append(chunk)

    return chunks


def _chunk_recursive(
    text: str,
    chunk_size: int,
    overlap: int,
    min_chunk_size: int,
) -> List[str]:
    pieces = _split_text(text, _SEPARATORS, chunk_size)
    if not pieces:
        return []
    # Any piece that still exceeds chunk_size (no separator matched) falls
    # back to word-boundary splitting before merging.
    expanded: List[str] = []
    for p in pieces:
        if len(p) > chunk_size:
            expanded.extend(_chunk_by_words(p, chunk_size, overlap, min_chunk_size))
        else:
            expanded.append(p)
    return _merge_splits(expanded, chunk_size, overlap, min_chunk_size)


# ---------------------------------------------------------------------------
# Sentence mode
# ---------------------------------------------------------------------------

def _chunk_by_sentences(
    text: str,
    chunk_size: int,
    overlap: int,
    min_chunk_size: int,
) -> List[str]:
    """Sentence-aware chunking: split on paragraph → sentence boundaries.

    Overlap is character-based: sentences from the tail of each chunk are
    carried into the next chunk until the overlap budget is exhausted.
    Single sentences that exceed chunk_size fall back to word chunking.
    """
    try:
        import nltk
    except ImportError:
        raise ImportError(
            "sentence chunking requires nltk: pip install nltk\n"
            "Then run: python -c \"import nltk; nltk.download('punkt_tab')\""
        )

    try:
        nltk.data.find("tokenizers/punkt_tab")
    except LookupError:
        nltk.download("punkt_tab", quiet=True)

    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    sentences: List[str] = []
    for para in paragraphs:
        sentences.extend(nltk.sent_tokenize(para))

    if not sentences:
        return []

    chunks: List[str] = []
    current: List[str] = []
    current_len = 0

    for sent in sentences:
        sent = sent.strip()
        if not sent:
            continue

        if len(sent) > chunk_size:
            if current:
                chunk = " ".join(current)
                if len(chunk) >= min_chunk_size:
                    chunks.append(chunk)
                current, current_len = [], 0
            chunks.extend(
                _chunk_by_words(sent, chunk_size=chunk_size, overlap=overlap,
                                min_chunk_size=min_chunk_size)
            )
            continue

        if current and current_len + len(sent) + 1 > chunk_size:
            chunk = " ".join(current)
            if len(chunk) >= min_chunk_size:
                chunks.append(chunk)

            overlap_sents: List[str] = []
            overlap_len = 0
            for s in reversed(current):
                if overlap_len + len(s) + 1 <= overlap:
                    overlap_sents.insert(0, s)
                    overlap_len += len(s) + 1
                else:
                    break
            current = overlap_sents
            current_len = overlap_len

        current.append(sent)
        current_len += len(sent) + 1

    if current:
        chunk = " ".join(current)
        if len(chunk) >= min_chunk_size:
            chunks.append(chunk)

    return chunks
