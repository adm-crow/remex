import threading
from unittest.mock import MagicMock, patch

import pytest


def test_default_model_returns_onnx_function():
    from chromadb.utils.embedding_functions import ONNXMiniLM_L6_V2
    from remex.core.embedding import _EF_CACHE, get_embedding_function
    _EF_CACHE.clear()
    ef = get_embedding_function("all-MiniLM-L6-v2")
    assert isinstance(ef, ONNXMiniLM_L6_V2)


def test_other_model_returns_fastembed_function():
    from remex.core.embedding import _EF_CACHE, _FastEmbedEmbeddingFunction, get_embedding_function

    _EF_CACHE.clear()
    with patch("remex.core.embedding.TextEmbedding"):
        ef = get_embedding_function("BAAI/bge-base-en-v1.5")
    assert isinstance(ef, _FastEmbedEmbeddingFunction)


def test_cache_returns_same_instance():
    from remex.core.embedding import _EF_CACHE, get_embedding_function

    _EF_CACHE.clear()
    ef1 = get_embedding_function("all-MiniLM-L6-v2")
    ef2 = get_embedding_function("all-MiniLM-L6-v2")
    assert ef1 is ef2


def test_cache_is_thread_safe():
    import queue
    from remex.core.embedding import _EF_CACHE, get_embedding_function

    _EF_CACHE.clear()
    results: queue.Queue = queue.Queue()

    def worker():
        results.put(get_embedding_function("all-MiniLM-L6-v2"))

    threads = [threading.Thread(target=worker) for _ in range(8)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    items = list(results.queue)
    assert all(r is items[0] for r in items)


def test_fastembed_function_embeds_documents():
    from remex.core.embedding import _EF_CACHE, _FastEmbedEmbeddingFunction

    _EF_CACHE.clear()
    mock_model = MagicMock()
    mock_model.embed.return_value = [[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]]

    with patch("remex.core.embedding.TextEmbedding", return_value=mock_model):
        ef = _FastEmbedEmbeddingFunction("BAAI/bge-base-en-v1.5")
        result = ef(["hello", "world"])
        assert len(result) == 2
        assert result[0] == [0.1, 0.2, 0.3]
