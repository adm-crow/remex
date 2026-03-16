__version__ = "0.5.5"

from .exceptions import CollectionNotFoundError, SourceNotFoundError, SynapseError, TableNotFoundError
from .logger import setup_logging
from .models import IngestProgress, IngestResult, QueryResult
from .pipeline import ingest, purge, query, reset, sources
from .sqlite_ingester import ingest_sqlite

__all__ = [
    "__version__",
    # core API
    "ingest",
    "ingest_sqlite",
    "purge",
    "query",
    "reset",
    "setup_logging",
    "sources",
    # models
    "IngestProgress",
    "IngestResult",
    "QueryResult",
    # exceptions
    "CollectionNotFoundError",
    "SourceNotFoundError",
    "SynapseError",
    "TableNotFoundError",
]
