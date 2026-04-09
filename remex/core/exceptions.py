"""Public exception hierarchy for remex.

All remex errors inherit from :class:`RemexError`, so callers can write a
single ``except RemexError`` to catch everything, or catch the more specific
subclasses for finer-grained handling.

Each subclass also inherits from the matching Python built-in (``ValueError``,
``FileNotFoundError``) so existing code that catches those continues to work.
"""


class RemexError(Exception):
    """Base class for all remex errors."""


# Backward-compatible alias — will be removed in a future major version.
SynapseError = RemexError


class CollectionNotFoundError(RemexError, ValueError):
    """Raised when the requested ChromaDB collection does not exist.

    Also inherits from :class:`ValueError` for backward compatibility.
    """


class SourceNotFoundError(RemexError, FileNotFoundError):
    """Raised when an ingestion source (directory or SQLite file) is not found.

    Also inherits from :class:`FileNotFoundError` for backward compatibility.
    """


class TableNotFoundError(RemexError, ValueError):
    """Raised when the specified SQLite table does not exist in the database.

    Also inherits from :class:`ValueError` for backward compatibility.
    """
