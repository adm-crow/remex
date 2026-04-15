"""Pydantic request/response schemas for the Remex API."""

from __future__ import annotations

from typing import Literal, Optional
from pydantic import BaseModel, Field, model_validator


def _validate_overlap(values):
    if values.overlap >= values.chunk_size:
        raise ValueError(
            f"overlap ({values.overlap}) must be smaller than chunk_size ({values.chunk_size})"
        )
    return values


# ---------------------------------------------------------------------------
# Requests
# ---------------------------------------------------------------------------

class IngestRequest(BaseModel):
    source_dir: str
    db_path: str = "./remex_db"
    embedding_model: str = "all-MiniLM-L6-v2"
    chunk_size: int = Field(default=1000, ge=1)
    overlap: int = Field(default=200, ge=0)
    min_chunk_size: int = Field(default=50, ge=1)
    chunking: Literal["word", "sentence"] = "word"
    incremental: bool = False
    streaming_threshold_mb: int = Field(default=50, ge=0)

    _check_overlap = model_validator(mode="after")(_validate_overlap)


class IngestSQLiteRequest(BaseModel):
    sqlite_path: str
    table: str
    db_path: str = "./remex_db"
    columns: Optional[list[str]] = None
    id_column: str = "id"
    row_template: Optional[str] = None
    embedding_model: str = "all-MiniLM-L6-v2"
    chunk_size: int = Field(default=1000, ge=1)
    overlap: int = Field(default=200, ge=0)
    min_chunk_size: int = Field(default=50, ge=1)
    chunking: Literal["word", "sentence"] = "word"

    _check_overlap = model_validator(mode="after")(_validate_overlap)


class QueryRequest(BaseModel):
    text: str
    db_path: str = "./remex_db"
    n_results: int = Field(default=5, ge=1)
    embedding_model: str = "all-MiniLM-L6-v2"
    where: Optional[dict] = None
    min_score: Optional[float] = Field(default=None, ge=0.0, le=1.0)


class ChatRequest(BaseModel):
    text: str
    db_path: str = "./remex_db"
    n_results: int = Field(default=5, ge=1)
    embedding_model: str = "all-MiniLM-L6-v2"
    where: Optional[dict] = None
    min_score: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    provider: Optional[str] = None
    model: Optional[str] = None
    api_key: Optional[str] = None


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
    text: str
    collections: list[str]
    db_path: str = "./remex_db"
    n_results: int = Field(default=5, ge=1)
    embedding_model: str = "all-MiniLM-L6-v2"
    where: Optional[dict] = None
    min_score: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    provider: Optional[str] = None
    model: Optional[str] = None
    api_key: Optional[str] = None


class MultiChatResponse(BaseModel):
    answer: str
    sources: list[QueryResultItem]
    provider: str
    model: str
    collections: list[str]


class CollectionStatsResponse(BaseModel):
    name: str
    total_chunks: int
    total_sources: int
    embedding_model: str


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
    new_name: str


class RenamedResponse(BaseModel):
    renamed: bool
    old_name: str
    new_name: str
