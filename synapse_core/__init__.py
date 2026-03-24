__version__ = "1.0.0"

from .exceptions import CollectionNotFoundError, SourceNotFoundError, SynapseError, TableNotFoundError
from .logger import setup_logging
from .models import IngestProgress, IngestResult, PurgeResult, QueryResult
from .pipeline import ingest, ingest_async, ingest_many, purge, query, query_async, reset, sources
from .sqlite_ingester import ingest_sqlite

__all__ = [
    "__version__",
    # core API
    "ingest",
    "ingest_async",
    "ingest_many",
    "ingest_sqlite",
    "purge",
    "query",
    "query_async",
    "reset",
    "setup_logging",
    "sources",
    # models
    "IngestProgress",
    "IngestResult",
    "PurgeResult",
    "QueryResult",
    # exceptions
    "CollectionNotFoundError",
    "SourceNotFoundError",
    "SynapseError",
    "TableNotFoundError",
]
