from remex.core import (
    __version__,
    # core API
    collection_stats,
    delete_source,
    ingest,
    ingest_async,
    ingest_many,
    ingest_sqlite,
    list_collections,
    purge,
    query,
    query_async,
    reset,
    setup_logging,
    sources,
    # config
    load_config,
    save_config,
    # AI
    DEFAULT_MODELS,
    PROVIDERS,
    detect_provider,
    generate_answer,
    # formats
    SUPPORTED_EXTENSIONS,
    is_supported,
    # models
    CollectionStats,
    IngestProgress,
    IngestResult,
    PurgeResult,
    QueryResult,
    # exceptions
    RemexError,
    SynapseError,  # backward-compat alias
    CollectionNotFoundError,
    SourceNotFoundError,
    TableNotFoundError,
)

__all__ = [
    "__version__",
    # core API
    "collection_stats",
    "delete_source",
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
    "SynapseError",
    "CollectionNotFoundError",
    "SourceNotFoundError",
    "TableNotFoundError",
]
