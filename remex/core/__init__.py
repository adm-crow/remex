__version__ = "1.3.0"

from .ai import DEFAULT_MODELS, PROVIDERS, detect_provider, generate_answer
from .config import load_config, save_config
from .exceptions import CollectionNotFoundError, RemexError, SourceNotFoundError, SynapseError, TableNotFoundError
from .extractors import SUPPORTED_EXTENSIONS, is_supported
from .logger import setup_logging
from .models import CollectionStats, IngestProgress, IngestResult, PurgeResult, QueryResult
from .pipeline import (
    collection_stats,
    delete_source,
    update_collection_description,
    ingest,
    ingest_async,
    ingest_many,
    list_collections,
    purge,
    query,
    query_async,
    reset,
    source_chunk_counts,
    sources,
)
from .sqlite_ingester import ingest_sqlite

__all__ = [
    "__version__",
    # core API
    "collection_stats",
    "delete_source",
    "update_collection_description",
    "ingest",
    "ingest_async",
    "ingest_many",
    "ingest_sqlite",
    "list_collections",
    "purge",
    "query",
    "query_async",
    "reset",
    "setup_logging",
    "source_chunk_counts",
    "sources",
    # config
    "load_config",
    "save_config",
    # AI
    "DEFAULT_MODELS",
    "PROVIDERS",
    "detect_provider",
    "generate_answer",
    # formats
    "SUPPORTED_EXTENSIONS",
    "is_supported",
    # models
    "CollectionStats",
    "IngestProgress",
    "IngestResult",
    "PurgeResult",
    "QueryResult",
    # exceptions
    "RemexError",
    "SynapseError",  # backward-compat alias
    "CollectionNotFoundError",
    "SourceNotFoundError",
    "TableNotFoundError",
]
