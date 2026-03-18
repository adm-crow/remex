__version__ = "0.7.0"

from .exceptions import CollectionNotFoundError, SourceNotFoundError, SynapseError, TableNotFoundError
from .logger import setup_logging
from .models import IngestProgress, IngestResult, PurgeResult, QueryResult
from .pipeline import ingest, ingest_many, purge, query, reset, sources
from .sqlite_ingester import ingest_sqlite

__all__ = [
    "__version__",
    # core API
    "ingest",
    "ingest_many",
    "ingest_sqlite",
    "purge",
    "query",
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
