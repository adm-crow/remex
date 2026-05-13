import os
import tempfile
import threading
from pathlib import Path
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


def _maybe_raise_missing_model(model_name: str, exc: Exception) -> None:
    """Re-raise *exc* with an actionable message when the ONNX file is missing.

    The ONNXRuntimeError "NO_SUCHFILE" fires when fastembed successfully
    resolved the model revision (snapshot dir created) but the LFS model file
    was never downloaded — typically because a corporate network blocks
    cdn-lfs.huggingface.co.  We extract the expected path from the error
    message so the user knows exactly where to place the manually-downloaded
    file.
    """
    import re
    err = str(exc)
    if "NO_SUCHFILE" not in err and "File doesn't exist" not in err:
        raise exc
    match = re.search(r"Load model from (.+?) failed", err)
    target_path = match.group(1).strip() if match else "(see error details)"
    raise ValueError(
        f"Embedding model '{model_name}' could not be loaded — the model file is missing.\n"
        f"This is usually caused by a network that blocks cdn-lfs.huggingface.co "
        f"(common on corporate networks).\n"
        f"Download the file manually and place it at:\n"
        f"  {target_path}\n"
        f"See Settings → AI & Server → Offline Models for step-by-step instructions."
    ) from exc


class _FastEmbedEmbeddingFunction:
    @staticmethod
    def name() -> str:
        return "fastembed"

    def __init__(self, model_name: str) -> None:
        if TextEmbedding is None:
            raise ImportError("fastembed is not installed. Run: pip install fastembed")
        try:
            self._model = TextEmbedding(model_name=model_name)
        except Exception as exc:
            _maybe_raise_missing_model(model_name, exc)

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


# ---------------------------------------------------------------------------
# Download-progress helpers (used by the SSE ingest route)
# ---------------------------------------------------------------------------

def _fastembed_cache_dir() -> Path:
    return Path(os.environ.get(
        "FASTEMBED_CACHE_PATH",
        Path(tempfile.gettempdir()) / "fastembed_cache",
    ))


def _get_model_info(model_name: str) -> "dict | None":
    """Return fastembed's internal metadata dict for model_name, or None."""
    if TextEmbedding is None or model_name == _DEFAULT_MODEL:
        return None
    try:
        for m in TextEmbedding.list_supported_models():
            if m.get("model") == model_name:
                return m
    except Exception:  # noqa: BLE001
        pass
    return None


def _model_cache_dir(model_name: str) -> "Path | None":
    """Return the fastembed cache directory for a model.

    fastembed often downloads models from a *different* HuggingFace repo than
    the model name suggests (e.g. intfloat/multilingual-e5-large is fetched
    from qdrant/multilingual-e5-large-onnx).  The authoritative repo is in the
    ``sources.hf`` field of list_supported_models().
    """
    info = _get_model_info(model_name)
    if info is None:
        return None
    hf_repo = info.get("sources", {}).get("hf", model_name)
    return _fastembed_cache_dir() / f"models--{hf_repo.replace('/', '--')}"


def is_model_cached(model_name: str) -> bool:
    """Return True if the fastembed model is fully present in the local cache."""
    if model_name == _DEFAULT_MODEL:
        return True  # ChromaDB's bundled ONNX — no fastembed download needed
    info = _get_model_info(model_name)
    if info is None:
        return False
    model_file = info.get("model_file", "model_optimized.onnx")
    cache_dir = _model_cache_dir(model_name)
    return cache_dir is not None and cache_dir.exists() and any(cache_dir.rglob(model_file))


def get_model_expected_bytes(model_name: str) -> int:
    """Return the approximate total download size in bytes for a fastembed model."""
    info = _get_model_info(model_name)
    if info is None:
        return 0
    return int(info.get("size_in_GB", 0.1) * 1024 ** 3)


def get_model_downloaded_bytes(model_name: str) -> int:
    """Return the bytes currently present in the fastembed cache for a model."""
    if model_name == _DEFAULT_MODEL:
        return 0
    cache_dir = _model_cache_dir(model_name)
    if cache_dir is None or not cache_dir.exists():
        return 0
    try:
        return sum(f.stat().st_size for f in cache_dir.rglob("*") if f.is_file())
    except OSError:
        return 0
