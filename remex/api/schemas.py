"""Pydantic request/response schemas for the Remex API."""

from __future__ import annotations

import os
from typing import Annotated, Any, Literal, Optional
from pydantic import AfterValidator, BaseModel, Field, field_validator, model_validator


def _validate_overlap(values):
    if values.overlap >= values.chunk_size:
        raise ValueError(
            f"overlap ({values.overlap}) must be smaller than chunk_size ({values.chunk_size})"
        )
    return values


def _validate_db_path(v: str) -> str:
    """Allow the default sentinel or any absolute path; block relative traversals."""
    if v != "./remex_db" and not os.path.isabs(v):
        raise ValueError("db_path must be an absolute path")
    return v


def _check_where_depth(obj: Any, depth: int = 0) -> None:
    """Prevent deeply nested or oversized ChromaDB filter expressions."""
    if depth > 5:
        raise ValueError("where filter is too deeply nested (max depth 5)")
    if isinstance(obj, dict):
        if len(obj) > 20:
            raise ValueError("where filter has too many keys (max 20)")
        for v in obj.values():
            _check_where_depth(v, depth + 1)
    elif isinstance(obj, list):
        if len(obj) > 50:
            raise ValueError("where filter list is too long (max 50 items)")
        for item in obj:
            _check_where_depth(item, depth + 1)


def _validate_where(v: Optional[dict[str, Any]]) -> Optional[dict[str, Any]]:
    if v is not None:
        _check_where_depth(v)
    return v


# Reusable annotated types — collapse 5x db_path and 3x where duplication.
DbPath = Annotated[str, AfterValidator(_validate_db_path)]
WhereFilter = Annotated[Optional[dict[str, Any]], AfterValidator(_validate_where)]


# ---------------------------------------------------------------------------
# Requests
# ---------------------------------------------------------------------------

_EMBEDDING_MODEL_FIELD = Field(
    default="all-MiniLM-L6-v2",
    max_length=256,
    pattern=r"^[a-zA-Z0-9][\w./\-]*$",
)
_TEXT_FIELD = Field(min_length=1, max_length=8192)
_API_KEY_FIELD = Field(default=None, max_length=512)


class IngestRequest(BaseModel):
    source_dir: str
    db_path: DbPath = "./remex_db"
    embedding_model: str = _EMBEDDING_MODEL_FIELD

    chunk_size: int = Field(default=768, ge=1)
    overlap: int = Field(default=150, ge=0)
    min_chunk_size: int = Field(default=50, ge=1)
    chunking: Literal["word", "sentence", "recursive"] = "recursive"
    incremental: bool = False
    streaming_threshold_mb: int = Field(default=50, ge=0)

    _check_overlap = model_validator(mode="after")(_validate_overlap)

    @field_validator("source_dir")
    @classmethod
    def must_be_absolute(cls, v: str) -> str:
        if not os.path.isabs(v):
            raise ValueError("source_dir must be an absolute path")
        return v


class IngestSQLiteRequest(BaseModel):
    sqlite_path: str
    # Exactly one of `table` or `sql_query` must be set. `table` is the
    # simple single-table mode; `sql_query` allows arbitrary SELECT/WITH
    # statements (e.g. JOINs across multiple tables, computed columns).
    table: Optional[str] = Field(default=None, max_length=256)
    sql_query: Optional[str] = Field(default=None, max_length=16384)
    db_path: DbPath = "./remex_db"
    columns: Optional[list[str]] = None
    id_column: str = Field(default="id", max_length=256)
    row_template: Optional[str] = Field(default=None, max_length=4096)
    embedding_model: str = _EMBEDDING_MODEL_FIELD
    chunk_size: int = Field(default=768, ge=1)
    overlap: int = Field(default=150, ge=0)
    min_chunk_size: int = Field(default=50, ge=1)
    chunking: Literal["word", "sentence", "recursive"] = "recursive"
    incremental: bool = False

    _check_overlap = model_validator(mode="after")(_validate_overlap)

    @model_validator(mode="after")
    def _exactly_one_source(self):
        if (self.table is None) == (self.sql_query is None):
            raise ValueError("provide exactly one of `table` or `sql_query`")
        if self.sql_query is not None:
            head = self.sql_query.lstrip().split(None, 1)[0].upper() if self.sql_query.strip() else ""
            if head not in ("SELECT", "WITH"):
                raise ValueError("sql_query must be a SELECT (or WITH ... SELECT) statement")
        return self

    @field_validator("sqlite_path")
    @classmethod
    def sqlite_must_be_absolute(cls, v: str) -> str:
        if not os.path.isabs(v):
            raise ValueError("sqlite_path must be an absolute path")
        return v


class QueryRequest(BaseModel):
    text: str = _TEXT_FIELD
    db_path: DbPath = "./remex_db"
    n_results: int = Field(default=5, ge=1, le=500)
    embedding_model: str = _EMBEDDING_MODEL_FIELD
    where: WhereFilter = None
    min_score: Optional[float] = Field(default=None, ge=0.0, le=1.0)


class ChatRequest(QueryRequest):
    """Single-collection AI answer. Inherits text/db_path/n_results/where/min_score
    from QueryRequest and adds provider/model/credentials so the response is
    synthesised by an LLM rather than returned raw."""
    provider: Optional[str] = None
    model: Optional[str] = None
    api_key: Optional[str] = _API_KEY_FIELD
    system_prompt: Optional[str] = Field(default=None, max_length=32768)
    # Custom-provider config — only consulted when provider == "custom"
    base_url:      Optional[str] = Field(default=None, max_length=1024)
    header_name:   Optional[str] = Field(default=None, max_length=128)
    header_prefix: Optional[str] = Field(default=None, max_length=64)


# ---------------------------------------------------------------------------
# Responses
# ---------------------------------------------------------------------------

class HealthResponse(BaseModel):
    status: str
    version: str


class InfoResponse(BaseModel):
    version: str
    supported_extensions: list[str]
    providers: list[str]
    detected_provider: Optional[str]


class IngestResultResponse(BaseModel):
    sources_found: int
    sources_ingested: int
    sources_skipped: int
    chunks_stored: int
    skipped_reasons: list[str]


class QueryResultItem(BaseModel):
    text: str
    source: str
    source_type: str
    score: float
    distance: float
    chunk: int
    doc_title: str
    doc_author: str
    doc_created: str


class ChatResponse(BaseModel):
    answer: str
    sources: list[QueryResultItem]
    provider: str
    model: str


class MultiChatRequest(ChatRequest):
    """Same as ChatRequest but spans an explicit list of collections instead of
    the single one in the URL."""
    collections: list[str]


class TestCustomProviderRequest(BaseModel):
    """Body for ``POST /system/test-custom-provider``."""
    base_url:      str             = Field(min_length=1, max_length=1024)
    api_key:       Optional[str]   = _API_KEY_FIELD
    header_name:   Optional[str]   = Field(default="Authorization", max_length=128)
    header_prefix: Optional[str]   = Field(default="Bearer ",      max_length=64)


class TestCustomProviderResponse(BaseModel):
    models: list[str]


class MultiChatResponse(BaseModel):
    answer: str
    sources: list[QueryResultItem]
    provider: str
    model: str
    collections: list[str]


class UpdateDescriptionRequest(BaseModel):
    description: str = Field(default="", max_length=500)


class CollectionStatsResponse(BaseModel):
    name: str
    total_chunks: int
    total_sources: int
    embedding_model: str
    description: str = ""


class PurgeResultResponse(BaseModel):
    chunks_deleted: int
    chunks_checked: int


class DeletedResponse(BaseModel):
    deleted: bool


class DeletedChunksResponse(BaseModel):
    deleted_chunks: int


class SQLiteTablesResponse(BaseModel):
    tables: list[str]


class SourceItem(BaseModel):
    source: str
    chunk_count: int


class RenameRequest(BaseModel):
    new_name: str = Field(
        min_length=3,
        max_length=512,
        pattern=r"^[a-zA-Z0-9][a-zA-Z0-9._-]*[a-zA-Z0-9]$",
    )


class RenamedResponse(BaseModel):
    renamed: bool
    old_name: str
    new_name: str
