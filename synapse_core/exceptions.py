"""Public exception hierarchy for synapse-core.

All synapse-specific errors inherit from :class:`SynapseError`, so callers
can write a single ``except SynapseError`` to catch everything, or catch the
more specific subclasses for finer-grained handling.

Each subclass also inherits from the matching Python built-in (``ValueError``,
``FileNotFoundError``) so existing code that catches those continues to work.
"""


class SynapseError(Exception):
    """Base class for all synapse-core errors."""


class CollectionNotFoundError(SynapseError, ValueError):
    """Raised when the requested ChromaDB collection does not exist.

    Also inherits from :class:`ValueError` for backward compatibility.
    """


class SourceNotFoundError(SynapseError, FileNotFoundError):
    """Raised when an ingestion source (directory or SQLite file) is not found.

    Also inherits from :class:`FileNotFoundError` for backward compatibility.
    """


class TableNotFoundError(SynapseError, ValueError):
    """Raised when the specified SQLite table does not exist in the database.

    Also inherits from :class:`ValueError` for backward compatibility.
    """
