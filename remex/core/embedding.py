import threading
from typing import TYPE_CHECKING

from chromadb.utils.embedding_functions import ONNXMiniLM_L6_V2

if TYPE_CHECKING:
    from chromadb import Documents, Embeddings
    from chromadb.api.types import EmbeddingFunction

try:
    from fastembed import TextEmbedding
except ImportError:
    TextEmbedding = None  # type: ignore[assignment,misc]

_EF_CACHE: dict[str, "EmbeddingFunction"] = {}
_EF_LOCK = threading.Lock()

_DEFAULT_MODEL = "all-MiniLM-L6-v2"


class _FastEmbedEmbeddingFunction:
    def __init__(self, model_name: str) -> None:
        if TextEmbedding is None:
            raise ImportError("fastembed is not installed. Run: pip install fastembed")
        self._model = TextEmbedding(model_name=model_name)

    def __call__(self, input: "Documents") -> "Embeddings":
        return [list(v) for v in self._model.embed(input)]


def get_embedding_function(model_name: str) -> "EmbeddingFunction":
    if model_name in _EF_CACHE:
        return _EF_CACHE[model_name]
    with _EF_LOCK:
        if model_name not in _EF_CACHE:
            if model_name == _DEFAULT_MODEL:
                _EF_CACHE[model_name] = ONNXMiniLM_L6_V2()
            else:
                _EF_CACHE[model_name] = _FastEmbedEmbeddingFunction(model_name)
    return _EF_CACHE[model_name]


def warmup(model_name: str) -> None:
    get_embedding_function(model_name)
