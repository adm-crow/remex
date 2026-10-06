import os
import sqlite3
from fastapi import APIRouter, BackgroundTasks, HTTPException, Query
from remex.core import collection_stats, delete_source, list_collections, purge, reset, source_chunk_counts, update_collection_description, warmup_collections
from remex.core.exceptions import CollectionNotFoundError, RemexError
from remex.core.pipeline import _get_client
from remex.api.schemas import (
    CollectionStatsResponse,
    DeletedChunksResponse,
    DeletedResponse,
    PurgeResultResponse,
    SQLiteTablesResponse,
    SourceItem,
    RenameRequest,
    RenamedResponse,
    UpdateDescriptionRequest,
)

router = APIRouter(prefix="/collections", tags=["collections"])


def _require_absolute_db_path(db_path: str) -> str:
    """Reject relative paths to prevent directory-traversal into unintended locations.

    Matches the rule in `_validate_db_path` (used by Pydantic Request bodies)
    so the same input is accepted/rejected consistently whether it arrives
    via query string or JSON body: the sentinel `"./remex_db"` is allowed,
    everything else must be absolute.
    """
    if db_path == "./remex_db":
        return db_path
    if not os.path.isabs(db_path):
        raise HTTPException(status_code=400, detail="db_path must be an absolute path")
    return db_path


@router.get("", response_model=list[str])
def get_collections(db_path: str = Query(..., description="Absolute path to the ChromaDB directory")) -> list[str]:
    _require_absolute_db_path(db_path)
    return list_collections(db_path=db_path)


@router.get("/sqlite/tables", response_model=SQLiteTablesResponse)
def list_sqlite_tables(
    path: str = Query(..., description="Absolute path to the SQLite file"),
) -> SQLiteTablesResponse:
    if not os.path.isabs(path):
        raise HTTPException(status_code=400, detail="Path must be absolute")
    if not os.path.isfile(path):
        raise HTTPException(status_code=400, detail="File does not exist")
    conn = None
    try:
        conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
        cursor = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        )
        tables = [row[0] for row in cursor.fetchall()]
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Cannot read SQLite file: {e}")
    finally:
        if conn:
            conn.close()
    return SQLiteTablesResponse(tables=tables)


@router.post("/warmup", status_code=202)
def warmup_models(
    background_tasks: BackgroundTasks,
    db_path: str = Query(..., description="Absolute path to the ChromaDB directory"),
) -> dict:
    """Kick off background model loading so the first query is not slow.

    Returns 202 immediately — model loading happens in the background.
    Large models can take minutes; this endpoint must never block the client.
    """
    _require_absolute_db_path(db_path)
    background_tasks.add_task(warmup_collections, db_path)
    return {"status": "ok"}


@router.get("/{collection}/stats", response_model=CollectionStatsResponse)
def get_stats(
    collection: str, db_path: str = Query(..., description="Absolute path to the ChromaDB directory")
) -> CollectionStatsResponse:
    _require_absolute_db_path(db_path)
    try:
        stats = collection_stats(db_path=db_path, collection_name=collection)
    except CollectionNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return CollectionStatsResponse(
        name=stats.name,
        total_chunks=stats.total_chunks,
        total_sources=stats.total_sources,
        embedding_model=stats.embedding_model,
        description=stats.description,
    )


@router.patch("/{collection}/description", response_model=CollectionStatsResponse)
def set_description(
    collection: str,
    req: UpdateDescriptionRequest,
    db_path: str = Query(..., description="Absolute path to the ChromaDB directory"),
) -> CollectionStatsResponse:
    _require_absolute_db_path(db_path)
    try:
        update_collection_description(
            db_path=db_path,
            collection_name=collection,
            description=req.description,
        )
        # Re-fetch stats to return the updated state; update_collection_description
        # only modifies metadata so count/sources are unchanged but we return the
        # full response shape for consistency.
        stats = collection_stats(db_path=db_path, collection_name=collection)
    except CollectionNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return CollectionStatsResponse(
        name=stats.name,
        total_chunks=stats.total_chunks,
        total_sources=stats.total_sources,
        embedding_model=stats.embedding_model,
        description=stats.description,
    )


@router.get("/{collection}/sources", response_model=list[SourceItem])
def get_sources(
    collection: str, db_path: str = Query(..., description="Absolute path to the ChromaDB directory")
) -> list[SourceItem]:
    _require_absolute_db_path(db_path)
    try:
        counts = source_chunk_counts(db_path=db_path, collection_name=collection)
    except CollectionNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return [
        SourceItem(source=src, chunk_count=count)
        for src, count in sorted(counts.items())
    ]


@router.delete("/{collection}/sources/{source:path}", response_model=DeletedChunksResponse)
def remove_source(
    collection: str, source: str, db_path: str = Query(..., description="Absolute path to the ChromaDB directory")
) -> DeletedChunksResponse:
    _require_absolute_db_path(db_path)
    try:
        deleted = delete_source(source=source, db_path=db_path, collection_name=collection)
    except RemexError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return DeletedChunksResponse(deleted_chunks=deleted)


@router.delete("/{collection}", response_model=DeletedResponse)
def reset_collection(
    collection: str, db_path: str = Query(..., description="Absolute path to the ChromaDB directory")
) -> DeletedResponse:
    _require_absolute_db_path(db_path)
    try:
        reset(db_path=db_path, collection_name=collection, confirm=True)
    except RemexError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return DeletedResponse(deleted=True)


@router.post("/{collection}/purge", response_model=PurgeResultResponse)
def purge_collection(
    collection: str, db_path: str = Query(..., description="Absolute path to the ChromaDB directory")
) -> PurgeResultResponse:
    _require_absolute_db_path(db_path)
    try:
        result = purge(db_path=db_path, collection_name=collection, raise_if_missing=True)
    except CollectionNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return PurgeResultResponse(
        chunks_deleted=result.chunks_deleted,
        chunks_checked=result.chunks_checked,
    )


@router.patch("/{collection}/rename", response_model=RenamedResponse)
def rename_collection(
    collection: str,
    req: RenameRequest,
    db_path: str = Query(..., description="Absolute path to the ChromaDB directory"),
) -> RenamedResponse:
    """Rename a ChromaDB collection in place.

    ``Collection.modify(name=...)`` is a single metadata update: no rows are
    copied, so there is no size limit, and the collection keeps its persisted
    embedding-function config. (Copying rows into a freshly created collection
    used to drop that config and leave the renamed collection unqueryable.)
    """
    _require_absolute_db_path(db_path)
    client = _get_client(db_path)
    try:
        old_col = client.get_collection(collection)
    except Exception:
        raise HTTPException(status_code=404, detail=f"Collection '{collection}' not found")

    existing = [c.name for c in client.list_collections()]
    if req.new_name in existing:
        raise HTTPException(status_code=409, detail=f"Collection '{req.new_name}' already exists")

    old_col.modify(name=req.new_name)
    return RenamedResponse(renamed=True, old_name=collection, new_name=req.new_name)
