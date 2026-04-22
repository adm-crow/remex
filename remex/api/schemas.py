"""Pydantic request/response schemas for the Remex API."""

from __future__ import annotations

import os
from typing import Any, Literal, Optional
from pydantic import BaseModel, Field, field_validator, model_validator


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


# ---------------------------------------------------------------------------
# Requests
# ---------------------------------------------------------------------------

_EMBEDDING_MODEL_FIELD = Field(
    default="all-MiniLM-L6-v2",
    max_length=256,
    pattern=r"^[a-zA-Z0-9][\w./\-]*$",
)
_TEXT_FIELD = Field(min_length=1, max_length=8192)


class IngestRequest(BaseModel):
    source_dir: str
    db_path: str = "./remex_db"
    embedding_model: str = _EMBEDDING_MODEL_FIELD

    @field_validator("db_path")
    @classmethod
    def _check_db_path(cls, v: str) -> str:
        return _validate_db_path(v)

    chunk_size: int = Field(default=1000, ge=1)
    overlap: int = Field(default=200, ge=0)
    min_chunk_size: int = Field(default=50, ge=1)
    chunking: Literal["word", "sentence"] = "word"
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
    table: str = Field(max_length=256)
    db_path: str = "./remex_db"
    columns: Optional[list[str]] = None
    id_column: str = Field(default="id", max_length=256)
    row_template: Optional[str] = None
    embedding_model: str = _EMBEDDING_MODEL_FIELD
    chunk_size: int = Field(default=1000, ge=1)
    overlap: int = Field(default=200, ge=0)
    min_chunk_size: int = Field(default=50, ge=1)
    chunking: Literal["word", "sentence"] = "word"
    incremental: bool = False

    _check_overlap = model_validator(mode="after")(_validate_overlap)

    @field_validator("db_path")
    @classmethod
    def _check_db_path(cls, v: str) -> str:
        return _validate_db_path(v)

    @field_validator("sqlite_path")
    @classmethod
    def sqlite_must_be_absolute(cls, v: str) -> str:
        if not os.path.isabs(v):
            raise ValueError("sqlite_path must be an absolute path")
        return v


class QueryRequest(BaseModel):
    text: str = _TEXT_FIELD
    db_path: str = "./remex_db"
    n_results: int = Field(default=5, ge=1, le=500)
    embedding_model: str = _EMBEDDING_MODEL_FIELD
    where: Optional[dict[str, Any]] = None
    min_score: Optional[float] = Field(default=None, ge=0.0, le=1.0)

    @field_validator("db_path")
    @classmethod
    def _check_db_path(cls, v: str) -> str:
        return _validate_db_path(v)

    @field_validator("where")
    @classmethod
    def validate_where(cls, v: Optional[dict[str, Any]]) -> Optional[dict[str, Any]]:
        if v is not None:
            _check_where_depth(v)
        return v


class ChatRequest(BaseModel):
    text: str = _TEXT_FIELD
    db_path: str = "./remex_db"
    n_results: int = Field(default=5, ge=1, le=500)
    embedding_model: str = _EMBEDDING_MODEL_FIELD
    where: Optional[dict[str, Any]] = None
    min_score: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    provider: Optional[str] = None
    model: Optional[str] = None
    api_key: Optional[str] = None

    @field_validator("db_path")
    @classmethod
    def _check_db_path(cls, v: str) -> str:
        return _validate_db_path(v)

    @field_validator("where")
    @classmethod
    def validate_where(cls, v: Optional[dict[str, Any]]) -> Optional[dict[str, Any]]:
        if v is not None:
            _check_where_depth(v)
        return v


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


class IngestProgressEvent(BaseModel):
    filename: str
    files_done: int
    files_total: int
    status: Literal["ingested", "skipped", "error"]
    chunks_stored: int


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


class MultiChatRequest(BaseModel):
    text: str = _TEXT_FIELD
    collections: list[str]
    db_path: str = "./remex_db"
    n_results: int = Field(default=5, ge=1, le=500)
    embedding_model: str = _EMBEDDING_MODEL_FIELD
    where: Optional[dict[str, Any]] = None
    min_score: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    provider: Optional[str] = None
    model: Optional[str] = None
    api_key: Optional[str] = None

    @field_validator("db_path")
    @classmethod
    def _check_db_path(cls, v: str) -> str:
        return _validate_db_path(v)

    @field_validator("where")
    @classmethod
    def validate_where(cls, v: Optional[dict[str, Any]]) -> Optional[dict[str, Any]]:
        if v is not None:
            _check_where_depth(v)
        return v


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
